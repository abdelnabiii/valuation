/** Client-safe intake state shape and pure helpers (completion, checks). */
import type { SectionDef } from "./sections";
import type { IntakeConfig } from "./config";

export interface UnitRow {
  id: string;
  name: string;
  format: string;
  city: string | null;
  openedOn: string | null; // YYYY-MM-DD
  status: string;
  sqm: number | null;
  seats: number | null;
}

export interface LeaseRow {
  yearsRemaining: number | null;
  monthlyRent: number | null;
  escalationPct: number | null;
  escalationEveryMonths: number | null;
  renewalRight: boolean | null;
  renewalTerms: string | null;
  deposit: number | null;
}

export interface CapexRow {
  id: string;
  unitId: string;
  category: string;
  description: string | null;
  cost: number | null;
  spentOn: string | null;
  imported: boolean;
}

export interface AddbackRow {
  id: string;
  kind: "owner_pay" | "one_off" | "related_party" | "non_operating";
  description: string;
  amount: number | null;
  recurring: boolean;
  evidenceNote: string | null;
}

export interface DebtRow {
  id: string;
  kind: string;
  counterparty: string | null;
  balance: number | null;
  currency: string;
  ratePct: number | null;
  maturity: string | null;
}

export interface UploadRow {
  id: string;
  filename: string;
  status: string;
  createdAt: string;
}

/** key = `${unitId|ho}|${line}|${channel|-}|${YYYY-MM}` */
export type FinancialCells = Record<string, number>;

export interface IntakeState {
  sections: Record<string, Record<string, unknown>>;
  units: UnitRow[];
  leases: Record<string, LeaseRow>;
  capex: CapexRow[];
  addbacks: AddbackRow[];
  debt: DebtRow[];
  financials: FinancialCells;
  uploads: UploadRow[];
}

export const cellKey = (unit: string, line: string, channel: string | null, month: string) =>
  `${unit}|${line}|${channel ?? "-"}|${month}`;

export function parseCellKey(k: string) {
  const [unit, line, ch, month] = k.split("|") as [string, string, string, string];
  return { unit, line, channel: ch === "-" ? null : ch, month };
}

/** Months (YYYY-MM) in the financials window, oldest first. */
export function monthsWindow(state: IntakeState): string[] {
  const f = state.sections.financials ?? {};
  const end = (f.end_month as string) || defaultEndMonth(state);
  const count = Math.min(24, Math.max(1, Number(f.months_count ?? 24)));
  const [y, m] = end.split("-").map(Number) as [number, number];
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function defaultEndMonth(state: IntakeState): string {
  const vd = state.sections.purpose?.valuation_date as string | undefined;
  const d = vd ? new Date(vd + "T00:00:00Z") : new Date();
  if (!vd) d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const filled = (v: unknown) => v !== undefined && v !== null && v !== "" && !(typeof v === "number" && Number.isNaN(v));

export function sectionCompletion(def: SectionDef, s: IntakeState, cfg: IntakeConfig): number {
  const CH = cfg.channels;
  const data = s.sections[def.key] ?? {};
  const fieldScore = () => {
    const req = (def.fields ?? []).filter((f) => f.required);
    if (!req.length) return 1;
    return req.filter((f) => filled(data[f.key])).length / req.length;
  };
  const operating = s.units.filter((u) => u.status !== "closed");
  switch (def.kind) {
    case "fields":
      return fieldScore();
    case "units": {
      if (!s.units.length) return 0;
      const per = s.units.map((u) => [u.name, u.format, u.city, u.openedOn].filter(filled).length / 4);
      return per.reduce((a, b) => a + b, 0) / per.length;
    }
    case "financials": {
      if (!operating.length) return 0;
      const months = monthsWindow(s);
      let need = 0;
      let have = 0;
      for (const u of operating) {
        for (const m of months) {
          if (u.openedOn && m < u.openedOn.slice(0, 7)) continue;
          need++;
          const rev = CH.some((c) => (s.financials[cellKey(u.id, "revenue", c.key, m)] ?? 0) > 0);
          const cogs = filled(s.financials[cellKey(u.id, "cogs", null, m)]);
          if (rev && cogs) have++;
        }
      }
      const grid = need ? have / need : 0;
      return 0.8 * grid + 0.2 * fieldScore();
    }
    case "leases": {
      if (!operating.length) return 0;
      const per = operating.map((u) => {
        const l = s.leases[u.id];
        return l ? [l.yearsRemaining, l.monthlyRent, l.renewalRight].filter(filled).length / 3 : 0;
      });
      return per.reduce((a, b) => a + b, 0) / per.length;
    }
    case "capex": {
      if (!operating.length) return 0;
      return operating.filter((u) => s.capex.some((c) => c.unitId === u.id && (c.cost ?? 0) > 0)).length / operating.length;
    }
    case "owner":
      return s.addbacks.some((a) => a.kind === "owner_pay") || data.none_confirmed ? 1 : 0;
    case "debt":
      return s.debt.some((d) => d.kind === "cash") || data.none_confirmed ? (s.debt.length || data.none_confirmed ? 1 : 0.5) : s.debt.length ? 0.5 : 0;
    case "uploads":
      return s.uploads.length ? 1 : 0;
    case "assets": {
      const rows = (data.rows as { market_value?: number | null }[] | undefined) ?? [];
      if (!rows.length) return 0;
      return rows.filter((r) => typeof r.market_value === "number").length / rows.length;
    }
  }
}

export function completion(s: IntakeState, cfg: IntakeConfig) {
  const per = cfg.sections.map((d) => ({ key: d.key, title: d.title, pct: Math.round(sectionCompletion(d, s, cfg) * 100) }));
  const counted = per.filter((p) => p.key !== "uploads");
  const overall = Math.round(counted.reduce((a, b) => a + b.pct, 0) / counted.length);
  return { per, overall };
}

export interface Issue {
  key: string;
  section: string;
  severity: "blocking" | "warning";
  message: string;
}

/** Validation and consistency checks. Never fills gaps; only reports them. */
export function checks(s: IntakeState, cfg: IntakeConfig): Issue[] {
  const CH = cfg.channels;
  const unitsModel = cfg.model === "units";
  const out: Issue[] = [];
  const months = monthsWindow(s);
  const fin = s.financials;
  const v = (u: string, line: string, ch: string | null, m: string) => fin[cellKey(u, line, ch, m)];
  const fmtM = (m: string) => m;
  for (const u of s.units.filter((x) => x.status !== "closed")) {
    let monthsWithData = 0;
    let gaps = 0;
    let started = false;
    for (const m of months) {
      const rev = CH.reduce((a, c) => a + (v(u.id, "revenue", c.key, m) ?? 0), 0);
      if (rev > 0) {
        monthsWithData++;
        if (started && gaps > 0) {
          out.push({ key: `gap:${u.id}:${m}`, section: "financials", severity: "warning", message: `${u.name}: missing months before ${fmtM(m)}.` });
          gaps = 0;
        }
        started = true;
        if (u.openedOn && m < u.openedOn.slice(0, 7))
          out.push({ key: `preopen:${u.id}:${m}`, section: "financials", severity: "warning", message: `${u.name}: revenue in ${m} is before the opening date ${u.openedOn}.` });
        const cogs = v(u.id, "cogs", null, m);
        if (cogs === undefined && unitsModel)
          out.push({ key: `nocogs:${u.id}:${m}`, section: "financials", severity: "blocking", message: `${u.name} ${m}: revenue but no cost of goods sold.` });
        else if (unitsModel && (cogs / rev > 0.7 || cogs / rev < 0.12))
          out.push({ key: `cogsratio:${u.id}:${m}`, section: "financials", severity: "warning", message: `${u.name} ${m}: COGS is ${((cogs / rev) * 100).toFixed(0)}% of revenue; please check.` });
        const del = v(u.id, "revenue", "delivery", m) ?? 0;
        const comm = v(u.id, "delivery_commission", null, m) ?? 0;
        if (del > 0 && comm === 0 && s.sections.financials?.delivery_reporting !== "net")
          out.push({ key: `nocomm:${u.id}:${m}`, section: "financials", severity: "warning", message: `${u.name} ${m}: delivery sales without delivery-app commission.` });
        const prime = ((cogs ?? 0) + (v(u.id, "labour", null, m) ?? 0)) / rev;
        if (unitsModel && prime > 0.75)
          out.push({ key: `prime:${u.id}:${m}`, section: "financials", severity: "warning", message: `${u.name} ${m}: prime cost is ${(prime * 100).toFixed(0)}% of revenue.` });
      } else if (started) gaps++;
      for (const k of Object.keys(fin)) if (k.startsWith(`${u.id}|`) && k.endsWith(`|${m}`) && (fin[k] ?? 0) < 0)
        out.push({ key: `neg:${k}`, section: "financials", severity: "warning", message: `${u.name} ${m}: negative value entered.` });
    }
    if (monthsWithData === 0 && cfg.model !== "early_stage")
      out.push({ key: `nofin:${u.id}`, section: "financials", severity: "blocking", message: `${u.name}: no monthly financials entered.` });
    // Rent consistency with lease
    const lease = s.leases[u.id];
    const last3 = months.slice(-3).map((m) => v(u.id, "rent", null, m)).filter((x): x is number => typeof x === "number");
    if (lease?.monthlyRent && last3.length) {
      const avg = last3.reduce((a, b) => a + b, 0) / last3.length;
      if (Math.abs(avg / lease.monthlyRent - 1) > 0.2)
        out.push({
          key: `rent:${u.id}`,
          section: "leases",
          severity: "warning",
          message: `${u.name}: rent in the P&L (avg ${Math.round(avg).toLocaleString("en-US")}) differs from lease rent (${Math.round(lease.monthlyRent).toLocaleString("en-US")}) by more than 20%.`,
        });
    }
    if (!u.openedOn && unitsModel) out.push({ key: `noopen:${u.id}`, section: "units", severity: "blocking", message: `${u.name}: opening date missing.` });
  }
  // Operations vs P&L cross-check
  const ops = s.sections.operations ?? {};
  const orders = Number(ops.daily_orders);
  const ticket = Number(ops.average_ticket);
  if (orders > 0 && ticket > 0) {
    const last3 = months.slice(-3);
    const rev3 =
      last3.reduce(
        (a, m) => a + s.units.reduce((b, u) => b + CH.reduce((c, ch) => c + (v(u.id, "revenue", ch.key, m) ?? 0), 0), 0),
        0,
      ) / 3;
    const implied = orders * ticket * 30.4;
    if (rev3 > 0 && Math.abs(implied / rev3 - 1) > 0.3)
      out.push({
        key: "ops:orders_vs_revenue",
        section: "operations",
        severity: "warning",
        message: `Daily orders x average ticket implies ${Math.round(implied).toLocaleString("en-US")} a month, but the P&L shows ${Math.round(rev3).toLocaleString("en-US")} (last 3 months).`,
      });
  }
  const g = s.sections.growth ?? {};
  const planned = [1, 2, 3, 4, 5].reduce((a, y) => a + (Number(g[`units_y${y}`]) || 0), 0);
  if (planned > 0 && !(Number(g.budget) > 0))
    out.push({ key: "growth:budget", section: "growth", severity: "warning", message: "New units are planned but no growth budget is given." });
  if (s.sections.financials?.delivery_reporting === "net")
    out.push({ key: "fin:delivery_net", section: "financials", severity: "warning", message: "Delivery sales are reported net of commission; the advisor must gross them up from app statements." });
  return out;
}
