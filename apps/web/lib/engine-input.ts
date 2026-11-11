import "server-only";
import { and, eq, isNull, desc, inArray } from "drizzle-orm";
import {
  CHANNELS,
  UNIT_COST_LINES,
  monthsBetween,
  type AssumptionInput,
  type Channel,
  type CostLine,
  type EngineInput,
  type UnitInput,
} from "@valuation/engine";
import { assumption, client, comparable, db, engagement, openItemResolution, source } from "./db";
import { loadIntake } from "./intake/server";
import { intakeConfig } from "./intake/config";
import { profileDefaultsFor } from "./profile";
import { cellKey, checks, type IntakeState } from "./intake/types";

const today = () => new Date().toISOString().slice(0, 10);

function lastDayOfMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** All months that hold any figure, sorted. */
function dataMonths(state: IntakeState) {
  return [...new Set(Object.keys(state.financials).map((k) => k.split("|")[3]!))].sort();
}

export async function loadAssumptionInputs(engagementId: string): Promise<Record<string, AssumptionInput>> {
  const rows = await db()
    .select()
    .from(assumption)
    .where(inArray(assumption.engagementId, [engagementId]));
  const globals = await db().select().from(assumption).where(isNull(assumption.engagementId));
  const out: Record<string, AssumptionInput> = {};
  for (const r of [...globals, ...rows]) {
    out[r.key] = {
      value: r.value === null ? null : Number(r.value),
      asOf: r.asOfDate,
      sourceId: r.sourceId,
      confirmed: r.confirmed,
      isPlaceholder: r.isPlaceholder,
    };
  }
  return out;
}

export async function buildEngineInput(engagementId: string): Promise<{ input: EngineInput; state: IntakeState; ttm: { from: string; to: string } | null }> {
  const d = db();
  const [row] = await d
    .select({ e: engagement, c: client })
    .from(engagement)
    .innerJoin(client, eq(client.id, engagement.clientId))
    .where(eq(engagement.id, engagementId));
  if (!row) throw new Error("Engagement not found");
  const { e, c } = row;
  const cfg = intakeConfig(e.profileKey);
  const state = await loadIntake(engagementId, cfg);
  const assumptions = await loadAssumptionInputs(engagementId);
  const dataIssues: EngineInput["dataIssues"] = [];

  // Valuation date and TTM window
  const months = dataMonths(state);
  const vd =
    e.valuationDate ??
    (state.sections.purpose?.valuation_date as string | undefined) ??
    (months.length ? lastDayOfMonth(months[months.length - 1]!) : today());
  const vdMonth = vd.slice(0, 7);
  const lastData = months.filter((m) => m <= vdMonth).pop() ?? null;
  const ttmEnd = lastData;
  const ttmStart = ttmEnd ? addMonths(ttmEnd, -11) : null;
  const inTtm = (m: string) => !!ttmStart && !!ttmEnd && m >= ttmStart && m <= ttmEnd;
  if (ttmEnd && ttmEnd < addMonths(vdMonth, -1))
    dataIssues.push({ key: "ttm_lag", severity: "warning", message: `Latest financials (${ttmEnd}) end more than a month before the valuation date (${vd}).` });

  // VAT conversion if the client reported VAT-inclusive sales
  const vatInclusive = state.sections.financials?.vat_inclusive === "yes";
  const vat = assumptions["macro.vat_rate"]?.value ?? null;
  const revDivisor = vatInclusive ? (vat !== null ? 1 + vat : 1) : 1;
  if (vatInclusive && vat === null)
    dataIssues.push({ key: "vat_conversion", severity: "blocking", message: "Sales are VAT-inclusive but no VAT rate is set, so they cannot be converted." });

  const units: UnitInput[] = state.units
    .filter((u) => u.status !== "pre_opening")
    .map((u) => {
      const ttmRevenue = Object.fromEntries(CHANNELS.map((ch) => [ch, 0])) as Record<Channel, number>;
      const ttmCosts = Object.fromEntries(UNIT_COST_LINES.map((l) => [l, 0])) as Record<CostLine, number>;
      const revMonths = new Set<string>();
      const monthly = new Map<string, number>();
      for (const [k, v] of Object.entries(state.financials)) {
        const [unitId, line, ch, m] = k.split("|") as [string, string, string, string];
        if (unitId !== u.id) continue;
        if (line === "revenue") {
          const amt = v / revDivisor;
          monthly.set(m, (monthly.get(m) ?? 0) + amt);
          if (inTtm(m)) {
            ttmRevenue[ch as Channel] += amt;
            if (amt > 0) revMonths.add(m);
          }
        } else if (inTtm(m) && (UNIT_COST_LINES as string[]).includes(line)) {
          ttmCosts[line as CostLine] += v;
        }
      }
      const capex = state.capex
        .filter((x) => x.unitId === u.id && (x.cost ?? 0) > 0)
        .map((x) => ({ category: x.category as "fit_out", description: x.description ?? undefined, cost: x.cost!, imported: x.imported }));
      const l = state.leases[u.id];
      return {
        id: u.id,
        name: u.name,
        openedOn: u.openedOn,
        ttmRevenue,
        ttmCosts,
        ttmMonths: revMonths.size,
        monthlyRevenue: u.openedOn
          ? [...monthly.entries()]
              .map(([m, amount]) => ({ monthIndex: monthsBetween(u.openedOn!.slice(0, 7) + "-01", m + "-01") + 1, amount }))
              .filter((x) => x.monthIndex >= 1)
              .sort((a, b) => a.monthIndex - b.monthIndex)
          : [],
        lease: l
          ? { yearsRemaining: l.yearsRemaining, monthlyRent: l.monthlyRent, escalationPct: l.escalationPct, renewalRight: l.renewalRight, deposit: l.deposit }
          : null,
        capex,
      } satisfies UnitInput;
    });

  let headOfficeCosts = 0;
  for (const [k, v] of Object.entries(state.financials)) {
    const [unitId, line, , m] = k.split("|") as [string, string, string, string];
    if (unitId === "ho" && line === "head_office" && inTtm(m)) headOfficeCosts += v;
  }

  // Operating history
  const openings = state.units.map((u) => u.openedOn).filter((x): x is string => !!x).sort();
  const founded = Number(state.sections.business?.founded);
  const start =
    cfg.model === "units"
      ? (openings[0] ?? (founded > 1900 ? `${founded}-01-01` : months[0] ? `${months[0]}-01` : vd))
      : founded > 1900
        ? `${founded}-01-01`
        : (openings[0] ?? (months[0] ? `${months[0]}-01` : vd));
  const monthsOfHistory = Math.max(0, monthsBetween(start.slice(0, 7) + "-01", vd.slice(0, 7) + "-01"));

  const comps = await d.select().from(comparable).where(eq(comparable.engagementId, engagementId));
  const waived = await d.select().from(openItemResolution).where(eq(openItemResolution.engagementId, engagementId));

  const ops = state.sections.operations ?? {};
  const costs = state.sections.costs ?? {};
  const growth = state.sections.growth ?? {};
  const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

  for (const i of checks(state, cfg)) dataIssues.push({ key: i.key, severity: i.severity, message: i.message });
  if (!state.units.length) dataIssues.push({ key: "no_units", severity: "blocking", message: "No units recorded." });
  if (c.isDemo)
    dataIssues.push({ key: "demo_client", severity: "blocking", message: "Demo client: financials are fictional and macro inputs and comparables are illustrative placeholders, not market data." });
  const compSources = comps.length ? await d.select({ id: source.id, accepted: source.accepted, title: source.title }).from(source).where(inArray(source.id, [...new Set(comps.map((x) => x.sourceId))])) : [];
  for (const x of comps.filter((x) => x.included)) {
    const s = compSources.find((y) => y.id === x.sourceId);
    if (!s || !s.accepted)
      dataIssues.push({ key: `comp_source:${x.id}`, severity: "blocking", message: `Comparable "${x.name}": its source has not been reviewed and accepted.` });
  }

  const input: EngineInput = {
    meta: {
      companyName: (state.sections.business?.brand_name as string) || c.name,
      valuationDate: vd,
      asOfToday: today(),
      modelCurrency: e.modelCurrency,
      crossCheckCurrency: e.crossCheckCurrency,
      monthsOfHistory,
      discountRateMethod: e.discountRateMethod === "egp_tbill" ? "egp_tbill" : "usd_buildup",
      waivedOpenItems: waived.map((w) => w.itemKey),
      profileKey: cfg.profileKey,
    },
    profileDefaults: await profileDefaultsFor(cfg.profileKey),
    growthPlan: {
      newUnitsByYear: [1, 2, 3, 4, 5].map((y) => (cfg.model === "units" ? (n(growth[`units_y${y}`]) ?? 0) : 0)),
      revenueGrowthNominal: [1, 2, 3, 4, 5].map((y) => n(growth[`growth_y${y}`])),
    },
    navAssets:
      cfg.model === "asset_heavy"
        ? ((state.sections.assets?.rows as { name?: string; kind?: string; market_value?: number | null; book_value?: number | null; valuer?: string | null; valuation_date?: string | null }[] | undefined) ?? []).map((r, k) => ({
            name: r.name?.trim() || `Asset ${k + 1}`,
            kind: r.kind ?? "other",
            marketValue: typeof r.market_value === "number" ? r.market_value : null,
            bookValue: typeof r.book_value === "number" ? r.book_value : null,
            sourceNote: [r.valuer, r.valuation_date].filter(Boolean).join(", ") || null,
          }))
        : [],
    earlyStage:
      cfg.model === "early_stage"
        ? {
            exitRevenue: n(growth.exit_revenue),
            exitYears: n(growth.exit_years),
            lastRoundPostMoney: n(state.sections.funding?.last_round_post_money),
            lastRoundDate: (state.sections.funding?.last_round_date as string) || null,
          }
        : undefined,
    units,
    headOfficeCosts,
    addbacks: state.addbacks.filter((a) => (a.amount ?? 0) !== 0).map((a) => ({ kind: a.kind, description: a.description || a.kind, amount: a.amount ?? 0 })),
    bridge: state.debt.filter((x) => x.balance !== null).map((x) => ({ kind: x.kind as "other", description: x.counterparty ?? x.kind, balance: x.balance!, currency: x.currency })),
    comparables: comps.map((x) => ({
      id: x.id,
      name: x.name,
      kind: x.kind,
      country: x.country,
      date: x.dealDate,
      evToEbitda: x.evToEbitda === null ? null : Number(x.evToEbitda),
      evToRevenue: x.evToRevenue === null ? null : Number(x.evToRevenue),
      priceToSde: x.priceToSde === null ? null : Number(x.priceToSde),
      sourceId: x.sourceId,
      included: x.included,
    })),
    operations: {
      dailyOrders: n(ops.daily_orders),
      averageTicket: n(ops.average_ticket),
      repeatRatePct: n(ops.repeat_rate),
      ownerDependencyScore: n(ops.owner_dependency),
      importedCogsShare: n(costs.imported_cogs_share),
      inventoryValue: n(ops.inventory_value),
      topCustomerShare: n(ops.top_customer_share),
    },
    assumptions,
    dataIssues,
  };
  void cellKey;
  void and;
  void desc;
  return { input, state, ttm: ttmStart && ttmEnd ? { from: ttmStart, to: ttmEnd } : null };
}
