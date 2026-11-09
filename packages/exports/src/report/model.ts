/**
 * Format-neutral report content model. Built once from an ExportContext and
 * rendered by both the Word (docx.ts) and PDF (pdf.ts) renderers so the two
 * formats always carry the same content.
 *
 * Rule: every figure comes from ctx (input / result / sources). Narrative
 * text here is either fixed methodology wording without figures or is
 * derived from data with the figure quoted from ctx.
 */
import { CATALOGUE_BY_KEY, CHANNELS, type EngineResult, type SensitivityGrid } from "@valuation/engine";
import { footballFieldSvg, heatmapSvg, paletteFromBranding, type ChartPalette, type SvgChart } from "../charts";
import { SECTION_LABELS, type ExportContext } from "../context";
import {
  ADDBACK_LABELS,
  CHANNEL_LABELS,
  COST_LABELS,
  ORIGIN_LABELS,
  fmtAmount,
  fmtByUnit,
  fmtDate,
  fmtFactor,
  fmtMoney,
  fmtMultiple,
  fmtPct,
  fmtYears,
  humanize,
} from "./format";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type Align = "left" | "right" | "center";

export interface TableColumn {
  header: string;
  align: Align;
  /** Relative width weight. */
  width: number;
}

export type RowStyle = "normal" | "subtotal" | "total" | "group" | "muted";

export interface TableRow {
  cells: string[];
  style?: RowStyle;
}

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string; tone?: "body" | "muted" | "lead" | "strong" }
  | { type: "bullets"; items: string[]; numbered?: boolean }
  | { type: "table"; columns: TableColumn[]; rows: TableRow[]; caption?: string; note?: string; small?: boolean }
  | { type: "kv"; items: { label: string; value: string }[] }
  | { type: "chart"; title: string; chart: SvgChart; caption?: string }
  | { type: "highlight"; label: string; value: string; lines: string[] }
  | { type: "pageBreak" };

export interface Section {
  id: string;
  title: string;
  pageBreakBefore: boolean;
  blocks: Block[];
}

export interface CoverModel {
  clientName: string;
  legalName: string | null;
  title: string;
  valuationDate: string;
  reportDate: string;
  preparedBy: string;
  firmName: string;
  purpose: string | null;
  scope: string | null;
  contactEmail: string | null;
  provisional: boolean;
  logoPng: Uint8Array | null;
  rangeLine: string;
}

export interface ReportModel {
  cover: CoverModel;
  sections: Section[];
  footerText: string;
  runningTitle: string;
  palette: ChartPalette;
  typeface: string;
  provisional: boolean;
}

/* ------------------------------------------------------------------ */
/* Shared derivations (also used by the deck)                          */
/* ------------------------------------------------------------------ */

const ASSET_LABELS: Record<string, string> = {
  equipment: "Equipment",
  fit_out: "Fit-out",
  furniture: "Furniture",
  other: "Other",
};

const BRIDGE_LABELS: Record<string, string> = {
  bank_loan: "Bank loan",
  shareholder_loan: "Shareholder loan",
  overdraft: "Overdraft",
  lease_liability: "Lease liability",
  deposit_paid: "Deposit paid",
  deposit_held: "Deposit held",
  cash: "Cash",
  other: "Other",
};

export const MANDATORY_DISCLAIMER =
  "This document is an advisory valuation. It is not a certified valuation by a licensed valuer and must not be presented or relied on as one.";

export function disclaimerParagraphs(ctx: ExportContext): string[] {
  const text = (ctx.branding.disclaimerText ?? "").trim();
  const out = text ? text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) : [];
  const lower = text.toLowerCase();
  if (!(lower.includes("advisory valuation") && lower.includes("not a certified valuation"))) out.push(MANDATORY_DISCLAIMER);
  return out;
}

export function spotFx(ctx: ExportContext): number | null {
  const a = ctx.result.assumptions.find((x) => x.key === "macro.fx_usd_egp");
  return a?.value ?? null;
}

export function deliveryShare(r: EngineResult): number {
  return r.normalization.revenue > 0 ? r.normalization.revenueByChannel.delivery / r.normalization.revenue : 0;
}

export function weightedLeaseYears(ctx: ExportContext): number | null {
  const units = ctx.input.units;
  const sales = (u: (typeof units)[number]) => CHANNELS.reduce((s, c) => s + (u.ttmRevenue[c] ?? 0), 0);
  const withLease = units.filter((u) => u.lease?.yearsRemaining !== null && u.lease?.yearsRemaining !== undefined);
  const w = withLease.reduce((s, u) => s + sales(u), 0);
  if (!withLease.length || w <= 0) return null;
  return withLease.reduce((s, u) => s + sales(u) * (u.lease!.yearsRemaining as number), 0) / w;
}

export function openItemsActive(r: EngineResult) {
  return r.openItems.filter((i) => !i.waived);
}

export interface Recommendation {
  key: string;
  title: string;
  text: string;
}

/** Rule-based value-enhancement recommendations. Figures quoted are from ctx only. */
export function deriveRecommendations(ctx: ExportContext): Recommendation[] {
  const r = ctx.result;
  const n = r.normalization;
  const ops = ctx.input.operations;
  const out: Recommendation[] = [];

  const ds = deliveryShare(r);
  if (ds > 0.2) {
    const comm = n.costs.delivery_commission;
    const commPct = n.revenueByChannel.delivery > 0 ? comm / n.revenueByChannel.delivery : null;
    out.push({
      key: "delivery",
      title: "Reduce reliance on delivery apps",
      text:
        `Delivery apps generate ${fmtPct(ds)} of trailing-twelve-month revenue` +
        (comm > 0 && commPct !== null ? `, with commission costs of ${fmtMoney(comm)} (${fmtPct(commPct)} of delivery revenue)` : "") +
        ". We recommend growing direct channels (dine-in, own ordering, wholesale) to reduce platform dependency and commission leakage.",
    });
  }

  if (ops.ownerDependencyScore !== null && ops.ownerDependencyScore >= 3) {
    out.push({
      key: "management",
      title: "Build a management layer",
      text: `Owner dependency is scored ${ops.ownerDependencyScore} out of 5. We recommend appointing a general manager, documenting operating procedures and delegating supplier and staff relationships so the business can operate without the owner.`,
    });
  }

  const wly = weightedLeaseYears(ctx);
  const shortLeases = ctx.input.units.filter(
    (u) => u.lease && ((u.lease.yearsRemaining !== null && u.lease.yearsRemaining < 5) || u.lease.renewalRight === false),
  );
  if ((wly !== null && wly < 5) || shortLeases.length) {
    const details = shortLeases.map((u) => {
      const yrs = u.lease!.yearsRemaining;
      const parts = [yrs !== null ? `${yrs.toFixed(1)} years remaining` : null, u.lease!.renewalRight === false ? "no renewal right" : null].filter(Boolean);
      return `${u.name} (${parts.join(", ")})`;
    });
    out.push({
      key: "leases",
      title: "Extend leases and secure renewal rights",
      text:
        (wly !== null ? `The sales-weighted lease term remaining is ${wly.toFixed(1)} years. ` : "") +
        (details.length ? `Units to address: ${details.join("; ")}. ` : "") +
        "We recommend negotiating extensions or renewal options before any transaction, as buyers price the risk of losing a trading site.",
    });
  }

  const prime = n.revenue > 0 ? (n.costs.cogs + n.costs.labour) / n.revenue : 0;
  const highPrimeUnits = r.unitEconomics.rows.filter((u) => u.primeCostPct > 0.6);
  if (prime > 0.6 || highPrimeUnits.length) {
    out.push({
      key: "prime_cost",
      title: "Run a prime-cost programme",
      text:
        `Prime cost (COGS plus labour) is ${fmtPct(prime)} of revenue` +
        (highPrimeUnits.length ? `; units above 60%: ${highPrimeUnits.map((u) => `${u.name} ${fmtPct(u.primeCostPct)}`).join(", ")}` : "") +
        ". We recommend a structured programme covering menu engineering, supplier terms, waste control and labour scheduling.",
    });
  }

  if (ops.importedCogsShare !== null && ops.importedCogsShare > 0.3) {
    out.push({
      key: "fx",
      title: "Reduce FX exposure in the cost base",
      text: `Imported inputs are ${fmtPct(ops.importedCogsShare)} of COGS. We recommend qualifying local substitutes where quality allows, agreeing longer-term supply contracts and building a pricing mechanism that passes through currency moves.`,
    });
  }

  const highRent = r.unitEconomics.rows.filter((u) => u.rentPct > 0.15);
  if (highRent.length) {
    out.push({
      key: "rent",
      title: "Address occupancy cost",
      text: `Rent exceeds 15% of sales at ${highRent.map((u) => `${u.name} (${fmtPct(u.rentPct)})`).join(", ")}. We recommend renegotiating rent or turnover-rent structures and applying an occupancy-cost ceiling to new sites.`,
    });
  }

  const pb = r.unitEconomics.newUnitPaybackYears;
  if (pb !== null && pb > 4) {
    out.push({
      key: "payback",
      title: "Review the new-unit format",
      text: `Estimated new-unit payback is ${fmtYears(pb)} years. We recommend reviewing fit-out specification and site size before committing to the expansion plan.`,
    });
  }

  if (ctx.input.meta.monthsOfHistory < 36) {
    out.push({
      key: "history",
      title: "Build a documented trading record",
      text: `The business has ${ctx.input.meta.monthsOfHistory} months of operating history. We recommend producing monthly management accounts per unit and reconciling them to tax filings, so future valuations can rely more on trailing earnings.`,
    });
  }

  if (n.totalAddbacks > 0) {
    out.push({
      key: "addbacks",
      title: "Document normalisation adjustments",
      text: `Addbacks of ${fmtMoney(n.totalAddbacks)} are included in seller's discretionary earnings. We recommend keeping supporting evidence for each addback, as buyers will test them in due diligence.`,
    });
  }

  const blocking = openItemsActive(r).filter((i) => i.severity === "blocking");
  if (blocking.length) {
    out.push({
      key: "open_items",
      title: "Close the open items",
      text: `${blocking.length} blocking open item${blocking.length === 1 ? "" : "s"} remain${blocking.length === 1 ? "s" : ""}. We recommend resolving them so the valuation can be finalised.`,
    });
  }
  return out;
}

export interface RiskItem {
  key: string;
  title: string;
  fact: string;
  mitigant: string | null;
}

const MITIGANT_FOR_ADJ: Record<string, string> = {
  "adj.dlom": "Inherent to a private-company interest; reduced by audited accounts and a well-organised data room.",
  "adj.key_person": "Build a management layer and document operating procedures.",
  "adj.lease_risk": "Negotiate lease extensions and renewal rights.",
  "adj.delivery": "Grow direct channels and own ordering.",
  "adj.fx": "Local sourcing, longer supply contracts and price pass-through.",
};

/** Facts-only risk list: value adjustments applied, method caveats and open items. */
export function deriveRisks(ctx: ExportContext): RiskItem[] {
  const r = ctx.result;
  const out: RiskItem[] = [];
  for (const a of r.adjustments.rows) {
    if (a.pct > 0)
      out.push({
        key: a.key,
        title: a.label,
        fact: `${a.rationale} A discount of ${fmtPct(a.pct)} is applied.`,
        mitigant: MITIGANT_FOR_ADJ[a.key] ?? null,
      });
  }
  const base = r.dcf.scenarios?.base;
  if (base && base.tvShareOfEv > 0.5)
    out.push({
      key: "tv_share",
      title: "Terminal value concentration",
      fact: `Terminal value accounts for ${fmtPct(base.tvShareOfEv)} of base-scenario DCF enterprise value.`,
      mitigant: "Delivery against the forecast in the early years reduces reliance on the terminal value.",
    });
  if (!r.dcf.available) out.push({ key: "dcf_na", title: "DCF not computed", fact: r.dcf.reason ?? "DCF not available.", mitigant: "Provide the missing inputs." });
  if (!r.multiples.available)
    out.push({ key: "mult_na", title: "Multiples not computed", fact: r.multiples.reason ?? "Multiples not available.", mitigant: "Add sourced comparables." });
  if (r.reconciliation.floorApplied)
    out.push({ key: "floor", title: "Asset floor applied", fact: "The weighted value fell below the asset-based floor in at least one case; the floor was applied.", mitigant: null });
  for (const w of r.discountRate?.warnings ?? []) out.push({ key: "dr_warning", title: "Discount rate method", fact: w, mitigant: null });
  const open = openItemsActive(r);
  if (open.length) {
    const b = open.filter((i) => i.severity === "blocking").length;
    out.push({
      key: "open_items",
      title: "Open items",
      fact: `${open.length} open item${open.length === 1 ? "" : "s"} (${b} blocking) remain unresolved; see the Open Items section.`,
      mitigant: "Resolve or formally waive each item before relying on the valuation.",
    });
  }
  return out;
}

/** Charts built from the result, shared by report and deck. */
export function buildCharts(ctx: ExportContext) {
  const palette = paletteFromBranding(ctx.branding);
  return {
    palette,
    footballField: footballFieldSvg(ctx.result, palette),
    heatmaps: ctx.result.sensitivities.map((g) => ({ grid: g, chart: heatmapSvg(g, palette) })),
  };
}

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

const L = (header: string, width = 3): TableColumn => ({ header, align: "left", width });
const R = (header: string, width = 1.4): TableColumn => ({ header, align: "right", width });

export function buildReportModel(ctx: ExportContext): ReportModel {
  const r = ctx.result;
  const rec = r.reconciliation;
  const n = r.normalization;
  const e = ctx.engagement;
  const ccy = e.crossCheckCurrency || "USD";
  const fx = spotFx(ctx);
  const charts = buildCharts(ctx);
  const provisional = !!r.provisional;

  const rangeLine = `${fmtMoney(rec.roundedLow)} – ${fmtMoney(rec.roundedHigh)} (mid-point ${fmtMoney(rec.roundedMid)})`;

  const cover: CoverModel = {
    clientName: e.clientName,
    legalName: e.legalName ?? null,
    title: e.title,
    valuationDate: fmtDate(e.valuationDate),
    reportDate: fmtDate(ctx.generatedAt),
    preparedBy: ctx.branding.advisorName,
    firmName: ctx.branding.firmName,
    purpose: e.purpose ?? null,
    scope: e.scope ?? null,
    contactEmail: ctx.branding.contactEmail ?? null,
    provisional,
    logoPng: ctx.branding.logoPng ?? null,
    rangeLine,
  };

  const sections: Section[] = [];
  const sec = (id: string, title: string, blocks: Block[], pageBreakBefore = false) =>
    sections.push({ id, title, blocks, pageBreakBefore });

  /* ---------------- Executive summary ---------------- */
  {
    const b: Block[] = [];
    if (provisional) {
      const blocking = openItemsActive(r).filter((i) => i.severity === "blocking").length;
      b.push({
        type: "paragraph",
        tone: "strong",
        text: blocking
          ? `PROVISIONAL: ${blocking} blocking open item${blocking === 1 ? "" : "s"} remain${blocking === 1 ? "s" : ""} unresolved. The figures below are indicative and must not be relied on until the open items are closed or waived.`
          : "PROVISIONAL: this valuation is flagged as provisional. The figures below are indicative and must not be relied on until it is finalised.",
      });
    }
    const usdLine =
      rec.usdLow !== null && rec.usdMid !== null && rec.usdHigh !== null && fx
        ? `${ccy} equivalent at spot (${fx.toFixed(2)} EGP/${ccy}): ${fmtMoney(rec.usdLow, ccy)} – ${fmtMoney(rec.usdHigh, ccy)}, mid-point ${fmtMoney(rec.usdMid, ccy)}.`
        : `${ccy} equivalent not available (no spot rate).`;
    b.push({
      type: "highlight",
      label: `Concluded equity value${e.scope ? `, ${e.scope}` : ""}, as at ${fmtDate(e.valuationDate)}`,
      value: `${fmtMoney(rec.roundedLow)} – ${fmtMoney(rec.roundedMid)} – ${fmtMoney(rec.roundedHigh)}`,
      lines: ["Low – mid – high, rounded to the nearest " + `EGP ${fmtAmount(rec.rounding)}.`, usdLine],
    });
    b.push({
      type: "table",
      columns: [L("", 3), R("Low"), R("Mid"), R("High")],
      rows: [
        { cells: ["Equity value (EGP)", fmtAmount(rec.roundedLow), fmtAmount(rec.roundedMid), fmtAmount(rec.roundedHigh)], style: "total" },
        {
          cells: [`Equity value (${ccy} at spot)`, fmtAmount(rec.usdLow), fmtAmount(rec.usdMid), fmtAmount(rec.usdHigh)],
        },
      ],
    });
    b.push({ type: "heading", level: 3, text: "Key drivers" });
    const drivers: string[] = [];
    drivers.push(
      `Trailing-twelve-month revenue of ${fmtMoney(n.revenue)} and normalized EBITDA of ${fmtMoney(n.normalizedEbitda)} (${fmtPct(n.normalizedMargin)} margin), after addbacks of ${fmtMoney(n.totalAddbacks)} and a market-rate manager cost of ${fmtMoney(n.marketManagerSalary)}.`,
    );
    if (r.discountRate) {
      const w = r.discountRate.waccEgp;
      drivers.push(
        `Discount rate: ${fmtPct(r.discountRate.costOfEquityUsd)} ${ccy} cost of equity, translated to EGP rates of ${fmtPct(w[0])} in year 1 to ${fmtPct(w[w.length - 1])} in year 5 and ${fmtPct(r.discountRate.waccEgpTerminal)} in the terminal period.`,
      );
    }
    const mw = rec.methods.map((m) => `${m.label} ${fmtPct(m.weight)}`).join(", ");
    drivers.push(`Method weights: ${mw}. ${rec.weightsRationale}`);
    if (r.dcf.available) drivers.push(`Probability-weighted DCF enterprise value of ${fmtMoney(r.dcf.weightedEv)}; market multiples mid-point of ${fmtMoney(r.multiples.mid)}.`);
    drivers.push(
      `Net equity bridge of ${fmtMoney(r.bridge.netAdjustment)} and combined value adjustments of ${fmtPct(r.adjustments.combinedDiscount)} (marketability, key-person, lease, delivery and FX factors).`,
    );
    drivers.push(`Asset-based floor of ${fmtMoney(r.assetFloor.floor)}${rec.floorApplied ? ", which was applied" : ", below the weighted value and therefore not applied"}.`);
    b.push({ type: "bullets", items: drivers });
    sec("summary", "Executive summary", b, true);
  }

  /* ---------------- Business overview ---------------- */
  {
    const p = ctx.profile;
    const b: Block[] = [];
    if (p.description) b.push({ type: "paragraph", text: p.description });
    const kv: { label: string; value: string }[] = [];
    kv.push({ label: "Company", value: e.legalName ? `${e.clientName} (${e.legalName})` : e.clientName });
    if (p.founded) kv.push({ label: "Founded", value: p.founded });
    if (p.concept) kv.push({ label: "Concept", value: p.concept });
    if (p.brandAssets) kv.push({ label: "Brand assets", value: p.brandAssets });
    kv.push({ label: "Trading units", value: `${ctx.input.units.length} (${ctx.input.units.map((u) => u.name).join(", ")})` });
    kv.push({ label: "Operating history", value: `${ctx.input.meta.monthsOfHistory} months` });
    if (p.growthPlan) kv.push({ label: "Growth plan", value: p.growthPlan });
    b.push({ type: "kv", items: kv });

    b.push({ type: "heading", level: 3, text: "Channel mix (trailing twelve months)" });
    b.push({
      type: "table",
      columns: [L("Channel", 3), R("Revenue (EGP)", 1.6), R("Share", 1)],
      rows: [
        ...CHANNELS.map((c) => ({
          cells: [CHANNEL_LABELS[c] ?? humanize(c), fmtAmount(n.revenueByChannel[c]), fmtPct(n.revenue > 0 ? n.revenueByChannel[c] / n.revenue : null)],
        })),
        { cells: ["Total", fmtAmount(n.revenue), fmtPct(n.revenue > 0 ? 1 : null)], style: "total" },
      ],
    });

    const ops = ctx.input.operations;
    const oi: { label: string; value: string }[] = [];
    if (ops.dailyOrders !== null) oi.push({ label: "Daily orders", value: fmtAmount(ops.dailyOrders) });
    if (ops.averageTicket !== null) oi.push({ label: "Average ticket", value: `EGP ${fmtAmount(ops.averageTicket)}` });
    if (ops.repeatRatePct !== null) oi.push({ label: "Repeat rate", value: fmtPct(ops.repeatRatePct) });
    if (ops.ownerDependencyScore !== null) oi.push({ label: "Owner dependency", value: `${ops.ownerDependencyScore} / 5` });
    if (ops.importedCogsShare !== null) oi.push({ label: "Imported share of COGS", value: fmtPct(ops.importedCogsShare) });
    if (ops.inventoryValue !== null) oi.push({ label: "Inventory (book)", value: `EGP ${fmtAmount(ops.inventoryValue)}` });
    if (oi.length) {
      b.push({ type: "heading", level: 3, text: "Operating indicators" });
      b.push({ type: "kv", items: oi });
    }
    sec("business", "Business overview", b, true);
  }

  /* ---------------- Methodology ---------------- */
  {
    const b: Block[] = [];
    b.push({
      type: "kv",
      items: [
        { label: "Standard of value", value: humanize(e.standardOfValue) },
        { label: "Premise of value", value: humanize(e.premise) },
        { label: "Basis", value: humanize(e.basis) },
        { label: "Valuation date", value: fmtDate(e.valuationDate) },
        { label: "Model currency", value: e.modelCurrency },
        { label: "Cross-check currency", value: e.crossCheckCurrency },
        ...(e.purpose ? [{ label: "Purpose", value: e.purpose }] : []),
        ...(e.scope ? [{ label: "Scope", value: e.scope }] : []),
        {
          label: "Discount rate method",
          value: ctx.input.meta.discountRateMethod === "usd_buildup" ? "USD build-up translated to EGP via inflation differential" : "EGP T-bill build-up",
        },
      ],
    });
    b.push({ type: "heading", level: 3, text: "The nine steps" });
    b.push({
      type: "bullets",
      numbered: true,
      items: [
        "Normalization: reported EBITDA is adjusted for owner pay, one-off, related-party and non-operating items to give seller's discretionary earnings (SDE); a market-rate manager cost is then deducted to reach normalized EBITDA.",
        "Unit economics: each trading unit's four-wall profitability, prime cost, rent ratio and payback are measured; mature units set the template for new openings.",
        "Discount rate: a cost of equity is built up from a risk-free rate, equity, country, size and company-specific premia, and translated into nominal EGP rates per forecast year.",
        "Discounted cash flow: five-year free cash flow forecasts are prepared for base, upside and downside scenarios, with a blended Gordon-growth and exit-multiple terminal value, and probability-weighted.",
        "Market multiples: EV/EBITDA, EV/Revenue and Price/SDE from sourced comparables are applied to the normalized earnings base.",
        "Asset-based floor: the recoverable value of fit-out, equipment, furniture and inventory, net of liquidation costs, sets a floor to the value.",
        "Value adjustments: discounts for marketability, key-person dependency, lease risk, delivery-app reliance and FX exposure are applied multiplicatively.",
        "Equity bridge and reconciliation: method results are weighted, the asset floor is tested, net debt and deposits are bridged to equity, adjustments applied and the range rounded.",
        "Sensitivity analysis: base-scenario value is re-computed across discount rate, growth, margin, same-store sales, new units and capex.",
      ],
    });
    sec("methodology", "Methodology", b, true);
  }

  /* ---------------- Normalized financials ---------------- */
  {
    const pctRev = (v: number) => fmtPct(n.revenue > 0 ? v / n.revenue : null);
    const rows: TableRow[] = [];
    rows.push({ cells: ["Revenue", "", ""], style: "group" });
    for (const c of CHANNELS) rows.push({ cells: [`  ${CHANNEL_LABELS[c]}`, fmtAmount(n.revenueByChannel[c]), pctRev(n.revenueByChannel[c])] });
    rows.push({ cells: ["Total revenue", fmtAmount(n.revenue), pctRev(n.revenue)], style: "subtotal" });
    rows.push({ cells: ["Operating costs", "", ""], style: "group" });
    for (const [k, v] of Object.entries(n.costs)) rows.push({ cells: [`  ${COST_LABELS[k] ?? humanize(k)}`, fmtAmount(-v), pctRev(v)] });
    rows.push({ cells: ["Total costs", fmtAmount(-n.totalCosts), pctRev(n.totalCosts)], style: "subtotal" });
    rows.push({ cells: ["Reported EBITDA", fmtAmount(n.reportedEbitda), fmtPct(n.reportedMargin)], style: "total" });
    rows.push({ cells: ["Addbacks", "", ""], style: "group" });
    if (!n.addbacks.length) rows.push({ cells: ["  None", "0", ""], style: "muted" });
    for (const a of n.addbacks) rows.push({ cells: [`  ${a.description} (${ADDBACK_LABELS[a.kind] ?? humanize(a.kind)})`, fmtAmount(a.amount), pctRev(a.amount)] });
    rows.push({ cells: ["Seller's discretionary earnings (SDE)", fmtAmount(n.sde), pctRev(n.sde)], style: "subtotal" });
    rows.push({ cells: ["Less: market-rate manager cost", fmtAmount(-n.marketManagerSalary), pctRev(n.marketManagerSalary)] });
    rows.push({ cells: ["Normalized EBITDA", fmtAmount(n.normalizedEbitda), fmtPct(n.normalizedMargin)], style: "total" });
    sec(
      "financials",
      "Normalized financials",
      [
        {
          type: "paragraph",
          text: `Trailing-twelve-month figures in EGP. Reported EBITDA of ${fmtMoney(n.reportedEbitda)} (${fmtPct(n.reportedMargin)} margin) is normalized to ${fmtMoney(n.normalizedEbitda)} (${fmtPct(n.normalizedMargin)} margin).`,
        },
        { type: "table", columns: [L("Item", 4), R("EGP", 1.6), R("% of revenue", 1.2)], rows },
      ],
      true,
    );
  }

  /* ---------------- Valuation methods ---------------- */
  {
    const b: Block[] = [];
    const ue = r.unitEconomics;
    b.push({ type: "heading", level: 2, text: "Unit economics" });
    b.push({
      type: "table",
      small: true,
      columns: [L("Unit", 1.7), R("Months open", 0.9), R("TTM sales", 1.35), R("Prime cost", 0.95), R("Rent", 0.8), R("Four-wall EBITDA", 1.35), R("Margin", 0.85), R("Investment", 1.35), R("Payback (yrs)", 0.95)],
      rows: [
        ...ue.rows.map((u) => ({
          cells: [
            u.name + (u.mature ? "" : " *"),
            u.monthsOpen === null ? "n/a" : String(u.monthsOpen),
            fmtAmount(u.sales),
            fmtPct(u.primeCostPct),
            fmtPct(u.rentPct),
            fmtAmount(u.fourWallEbitda),
            fmtPct(u.fourWallMargin),
            fmtAmount(u.investment),
            fmtYears(u.paybackYears),
          ],
        })),
        {
          cells: ["Total", "", fmtAmount(ue.totals.sales), "", "", fmtAmount(ue.totals.fourWallEbitda), fmtPct(ue.totals.fourWallMargin), fmtAmount(ue.totals.investment), ""],
          style: "total",
        },
      ],
      note: "EGP. Prime cost (COGS plus labour) and rent as % of unit sales. * Not yet mature (under 24 months open or partial TTM).",
    });
    b.push({ type: "heading", level: 3, text: "New-unit template" });
    b.push({
      type: "kv",
      items: [
        { label: "Mature annual sales per new unit", value: `EGP ${fmtAmount(ue.newUnitMatureSales)}` },
        { label: "Capex per new unit", value: `EGP ${fmtAmount(ue.newUnitCapex)}` },
        { label: "Four-wall margin (mature)", value: fmtPct(ue.newUnitFourWallMargin) },
        { label: "Payback", value: ue.newUnitPaybackYears === null ? "n/a" : `${fmtYears(ue.newUnitPaybackYears)} years` },
        { label: "Ramp-up: year 1 / year 2 sales as % of mature", value: `${fmtPct(ue.rampY1)} / ${fmtPct(ue.rampY2)}` },
      ],
    });

    // Discount rate
    b.push({ type: "heading", level: 2, text: "Discount rate" });
    const dr = r.discountRate;
    if (dr) {
      b.push({
        type: "table",
        columns: [L("Component", 4), R("Rate", 1.2)],
        rows: [
          ...dr.components.map((c) => ({ cells: [c.label, fmtPct(c.value)] })),
          { cells: [dr.method === "usd_buildup" ? `Cost of equity (${ccy})` : "Cost of equity (EGP)", fmtPct(dr.method === "usd_buildup" ? dr.costOfEquityUsd : dr.waccEgpTerminal)], style: "total" },
        ],
      });
      b.push({
        type: "table",
        columns: [L("Nominal EGP discount rate", 2.4), ...dr.waccEgp.map((_, i) => R(`Year ${i + 1}`, 1)), R("Terminal", 1)],
        rows: [{ cells: ["Discount rate (WACC)", ...dr.waccEgp.map(fmtPct), fmtPct(dr.waccEgpTerminal)] }],
        note: `${ccy} discount rate used for the cross-check: ${fmtPct(dr.waccUsd)}.`,
      });
      for (const w of dr.warnings) b.push({ type: "paragraph", tone: "muted", text: `Note: ${w}` });
    } else {
      b.push({ type: "paragraph", text: "Discount rate not computed." });
    }

    // DCF
    b.push({ type: "heading", level: 2, text: "Discounted cash flow" });
    const sc = r.dcf.scenarios;
    if (r.dcf.available && sc) {
      const yrs = sc.base.years;
      const row = (label: string, f: (y: (typeof yrs)[number]) => string, style?: RowStyle): TableRow => ({ cells: [label, ...yrs.map(f)], style });
      b.push({
        type: "table",
        caption: "Base-scenario forecast (EGP, nominal)",
        small: true,
        columns: [L("", 2.6), ...yrs.map((y) => R(`Year ${y.year}`, 1.2))],
        rows: [
          row("New units opened", (y) => String(y.newUnitsOpened)),
          row("Revenue: existing units", (y) => fmtAmount(y.existingRevenue)),
          row("Revenue: new units", (y) => fmtAmount(y.newUnitRevenue)),
          row("Total revenue", (y) => fmtAmount(y.revenue), "subtotal"),
          row("EBITDA margin", (y) => fmtPct(y.ebitdaMargin)),
          row("EBITDA", (y) => fmtAmount(y.ebitda), "subtotal"),
          row("Memo: depreciation & amortisation", (y) => fmtAmount(y.da), "muted"),
          row("Memo: EBIT", (y) => fmtAmount(y.ebit), "muted"),
          row("Tax on EBIT", (y) => fmtAmount(-y.tax)),
          row("Expansion capex", (y) => fmtAmount(-y.expansionCapex)),
          row("Maintenance capex", (y) => fmtAmount(-y.maintenanceCapex)),
          row("Change in working capital", (y) => fmtAmount(-y.deltaNwc)),
          row("Free cash flow to firm", (y) => fmtAmount(y.fcff), "total"),
          row("Discount rate", (y) => fmtPct(y.discountRate)),
          row("Discount factor (mid-year)", (y) => fmtFactor(y.discountFactor)),
          row("Present value", (y) => fmtAmount(y.pv), "subtotal"),
        ],
        note: "Free cash flow to firm = EBITDA less tax on EBIT (memo lines), expansion and maintenance capex and the change in working capital. Mid-year discounting.",
      });
      b.push({ type: "heading", level: 3, text: "Scenario results" });
      b.push({
        type: "table",
        small: true,
        columns: [L("Scenario", 1.4), R("Probability", 1), R("Sum of PV", 1.3), R("PV of TV (Gordon)", 1.4), R("PV of TV (exit)", 1.4), R("Enterprise value", 1.4), R("TV share", 0.9)],
        rows: [
          ...(["base", "upside", "downside"] as const).map((s) => ({
            cells: [humanize(s), fmtPct(r.dcf.weights[s]), fmtAmount(sc[s].sumPv), fmtAmount(sc[s].pvTvGordon), fmtAmount(sc[s].pvTvExit), fmtAmount(sc[s].ev), fmtPct(sc[s].tvShareOfEv)],
          })),
          { cells: ["Probability-weighted", "", "", "", "", fmtAmount(r.dcf.weightedEv), ""], style: "total" },
        ],
      });
      const exitA = r.assumptions.find((a) => a.key === "dcf.exit_multiple");
      const gw = r.assumptions.find((a) => a.key === "dcf.tv_weight_gordon");
      b.push({ type: "heading", level: 3, text: "Terminal value (base scenario)" });
      b.push({
        type: "kv",
        items: [
          { label: "Terminal free cash flow", value: `EGP ${fmtAmount(sc.base.terminalFcff)}` },
          { label: "Terminal nominal growth", value: fmtPct(sc.base.terminalGrowth) },
          { label: "Gordon-growth terminal value", value: `EGP ${fmtAmount(sc.base.tvGordon)}` },
          { label: "Exit-multiple terminal value", value: `EGP ${fmtAmount(sc.base.tvExit)}${exitA?.value != null ? ` (${fmtMultiple(exitA.value)} EBITDA)` : ""}` },
          { label: "Weight on Gordon growth", value: fmtPct(gw?.value ?? null) },
          { label: "Discount factor, end of year 5", value: fmtFactor(sc.base.discountFactorEnd) },
        ],
      });
      const x = r.dcf.usdCrossCheck;
      if (x) {
        b.push({ type: "heading", level: 3, text: `${ccy} cross-check (base scenario)` });
        b.push({
          type: "kv",
          items: [
            { label: "FX basis", value: x.fxBasis === "ppp" ? "Purchasing power parity from spot" : "Sourced FX forecast" },
            { label: `Enterprise value in ${ccy}`, value: `${ccy} ${fmtAmount(x.evUsd)}` },
            { label: "Translated at spot", value: `EGP ${fmtAmount(x.evUsdInEgp)}` },
            { label: "Difference to EGP DCF", value: fmtPct(x.differencePct) },
          ],
        });
      }
    } else {
      b.push({ type: "paragraph", text: `The DCF was not computed. ${r.dcf.reason ?? ""}`.trim() });
    }

    // Multiples
    b.push({ type: "heading", level: 2, text: "Market multiples" });
    const mlabel: Record<string, string> = { ev_ebitda: "EV / EBITDA", ev_revenue: "EV / Revenue", price_sde: "Price / SDE" };
    const blabel: Record<string, string> = { ev_ebitda: "Normalized EBITDA", ev_revenue: "TTM revenue", price_sde: "SDE" };
    b.push({
      type: "table",
      columns: [L("Multiple", 2), R("Comps", 0.8), R("Q1", 0.9), R("Median", 0.9), R("Q3", 0.9), R("Selected", 1), R("Weight", 1)],
      rows: r.multiples.stats.map((s) => ({
        cells: [mlabel[s.metric] ?? s.metric, String(s.count), fmtMultiple(s.q1), fmtMultiple(s.median), fmtMultiple(s.q3), fmtMultiple(s.selected), fmtPct(s.weight)],
      })),
    });
    b.push({
      type: "table",
      columns: [L("Implied enterprise value", 2.2), R("Earnings base", 1.3), R("Low (Q1)", 1.3), R("Mid (selected)", 1.3), R("High (Q3)", 1.3)],
      rows: [
        ...r.multiples.stats.map((s) => ({
          cells: [`${mlabel[s.metric]} on ${blabel[s.metric]}`, fmtAmount(s.base), fmtAmount(s.low), fmtAmount(s.mid), fmtAmount(s.high)],
        })),
        ...(r.multiples.available ? [{ cells: ["Weighted", "", fmtAmount(r.multiples.low), fmtAmount(r.multiples.mid), fmtAmount(r.multiples.high)], style: "total" as const }] : []),
      ],
      note: r.multiples.available ? "EGP." : `Multiples not computed. ${r.multiples.reason ?? ""}`,
    });
    const comps = ctx.input.comparables.filter((c) => c.included);
    if (comps.length) {
      const srcTitle = (id: string) => ctx.sources.find((s) => s.id === id)?.title ?? "No source";
      b.push({ type: "heading", level: 3, text: "Comparables included" });
      b.push({
        type: "table",
        small: true,
        columns: [L("Comparable", 2.0), L("Type", 1.25), L("Country", 1.0), L("Date", 1.1), R("EV/EBITDA", 0.9), R("EV/Rev", 0.8), R("P/SDE", 0.8), L("Source", 2)],
        rows: comps.map((c) => ({
          cells: [c.name, humanize(c.kind), c.country ?? "n/a", c.date ? fmtDate(c.date) : "n/a", fmtMultiple(c.evToEbitda), fmtMultiple(c.evToRevenue), fmtMultiple(c.priceToSde), srcTitle(c.sourceId)],
        })),
      });
    }

    // Asset floor
    const af = r.assetFloor;
    b.push({ type: "heading", level: 2, text: "Asset-based floor" });
    b.push({
      type: "table",
      columns: [L("Asset", 2.4), R("Cost / book (EGP)", 1.5), R("Recovery", 1), R("Value (EGP)", 1.5)],
      rows: [
        ...af.rows.map((x) => ({ cells: [ASSET_LABELS[x.category] ?? humanize(x.category), fmtAmount(x.cost), fmtPct(x.resalePct), fmtAmount(x.value)] })),
        { cells: ["Inventory", fmtAmount(af.inventory), fmtPct(af.inventoryRecoveryPct), fmtAmount(af.inventoryValue)] },
        { cells: ["Gross recoverable value", "", "", fmtAmount(af.gross)], style: "subtotal" },
        { cells: ["Less: liquidation costs", "", fmtPct(af.liquidationCostPct), fmtAmount(-af.liquidationCost)] },
        { cells: ["Asset-based floor", "", "", fmtAmount(af.floor)], style: "total" },
      ],
    });

    // Adjustments
    b.push({ type: "heading", level: 2, text: "Value adjustments" });
    b.push({
      type: "table",
      columns: [L("Adjustment", 1.9), R("Applied", 0.9), R("Suggested", 0.9), L("Rationale", 3.6)],
      rows: [
        ...r.adjustments.rows.map((a) => ({ cells: [a.label, fmtPct(a.pct), fmtPct(a.suggestedPct), a.rationale] })),
        { cells: ["Combined discount", fmtPct(r.adjustments.combinedDiscount), "", `Applied multiplicatively: factor ${fmtFactor(r.adjustments.combinedFactor)}.`], style: "total" },
      ],
    });

    // Bridge
    b.push({ type: "heading", level: 2, text: "Equity bridge" });
    if (r.bridge.rows.length) {
      b.push({
        type: "table",
        columns: [L("Item", 2.4), L("Currency", 0.8), R("Balance", 1.3), R("EGP", 1.3), L("Treatment", 2)],
        rows: [
          ...r.bridge.rows.map((x) => ({
            cells: [
              x.description || BRIDGE_LABELS[x.kind] || humanize(x.kind),
              x.currency,
              fmtAmount(x.balance),
              fmtAmount(x.sign * x.balanceEgp),
              x.note ?? (x.sign > 0 ? "Added" : x.sign < 0 ? "Deducted" : "Excluded"),
            ],
          })),
          { cells: ["Net adjustment", "", "", fmtAmount(r.bridge.netAdjustment), ""], style: "total" },
        ],
        note: fx ? `${ccy} balances translated at spot ${fx.toFixed(2)} EGP/${ccy}.` : undefined,
      });
    } else {
      b.push({ type: "paragraph", text: "No debt, cash or deposit balances were provided; the equity bridge is nil." });
    }
    b.push({
      type: "table",
      columns: [L("From enterprise to equity value (EGP)", 3), R("Low"), R("Mid"), R("High")],
      rows: [
        { cells: ["Weighted enterprise value" + (rec.floorApplied ? " (after floor)" : ""), fmtAmount(rec.evLow), fmtAmount(rec.evMid), fmtAmount(rec.evHigh)] },
        { cells: ["Net equity bridge", fmtAmount(r.bridge.netAdjustment), fmtAmount(r.bridge.netAdjustment), fmtAmount(r.bridge.netAdjustment)] },
        { cells: ["Equity value before adjustments", fmtAmount(rec.equityLow), fmtAmount(rec.equityMid), fmtAmount(rec.equityHigh)], style: "subtotal" },
        { cells: [`Value adjustments (factor ${fmtFactor(r.adjustments.combinedFactor)})`, fmtAmount(rec.adjustedLow - rec.equityLow), fmtAmount(rec.adjustedMid - rec.equityMid), fmtAmount(rec.adjustedHigh - rec.equityHigh)] },
        { cells: ["Adjusted equity value", fmtAmount(rec.adjustedLow), fmtAmount(rec.adjustedMid), fmtAmount(rec.adjustedHigh)], style: "subtotal" },
        { cells: [`Concluded (rounded to EGP ${fmtAmount(rec.rounding)})`, fmtAmount(rec.roundedLow), fmtAmount(rec.roundedMid), fmtAmount(rec.roundedHigh)], style: "total" },
      ],
    });
    sec("methods", "Results by method", b, true);
  }

  /* ---------------- Reconciliation ---------------- */
  {
    const b: Block[] = [];
    b.push({
      type: "table",
      columns: [L("Method (enterprise value, EGP)", 2.6), R("Low", 1.3), R("Mid", 1.3), R("High", 1.3), R("Weight", 0.9)],
      rows: [
        ...rec.methods.map((m) => ({
          cells: [m.label + (m.available ? "" : " (not computed)"), fmtAmount(m.low), fmtAmount(m.mid), fmtAmount(m.high), fmtPct(m.weight)],
          style: m.available ? undefined : ("muted" as const),
        })),
        { cells: ["Weighted enterprise value", fmtAmount(rec.evLow), fmtAmount(rec.evMid), fmtAmount(rec.evHigh), fmtPct(1)], style: "total" },
      ],
      note: "DCF low and high are the downside and upside scenarios; multiples low and high use the comparables' lower and upper quartiles.",
    });
    b.push({ type: "paragraph", text: rec.weightsRationale });
    b.push({
      type: "paragraph",
      text: rec.floorApplied
        ? `The asset-based floor of ${fmtMoney(r.assetFloor.floor)} was applied where the weighted value fell below it.`
        : `The asset-based floor of ${fmtMoney(r.assetFloor.floor)} is below the weighted range and was not applied.`,
    });
    b.push({
      type: "chart",
      title: "Valuation range by method",
      chart: charts.footballField,
      caption: `Method bars on an enterprise value basis; concluded range on an equity basis after the equity bridge and value adjustments: ${rangeLine}.`,
    });
    sec("reconciliation", "Reconciliation", b, true);
  }

  /* ---------------- Sensitivities ---------------- */
  {
    const b: Block[] = [];
    b.push({
      type: "paragraph",
      text: "Each table re-computes the base-scenario DCF enterprise value while flexing two inputs at a time; all other assumptions are held constant. Values are before the equity bridge and value adjustments.",
    });
    if (!r.dcf.available) b.push({ type: "paragraph", tone: "muted", text: "Sensitivities are not available because the DCF was not computed." });
    else
      charts.heatmaps.forEach((h: { grid: SensitivityGrid; chart: SvgChart }) =>
        b.push({ type: "chart", title: h.grid.title, chart: h.chart, caption: `Rows: ${h.grid.rowLabel}. Columns: ${h.grid.colLabel}.` }),
      );
    sec("sensitivities", "Sensitivity analysis", b, true);
  }

  /* ---------------- Risks ---------------- */
  {
    const risks = deriveRisks(ctx);
    const b: Block[] = [];
    b.push({ type: "paragraph", text: "The following risk factors are identified from the data and are reflected in the value adjustments or method results as indicated." });
    if (risks.length) b.push({ type: "table", columns: [L("Risk", 1.6), L("Fact", 4.4)], rows: risks.map((x) => ({ cells: [x.title, x.fact] })) });
    else b.push({ type: "paragraph", text: "No specific risk factors were triggered by the data." });
    sec("risks", "Key risks", b, true);
  }

  /* ---------------- Recommendations ---------------- */
  {
    const recs = deriveRecommendations(ctx);
    const b: Block[] = [];
    b.push({ type: "paragraph", text: "Recommendations are generated from the data provided and are intended to improve value or reduce the risk discounts applied. They do not quantify any uplift." });
    if (!recs.length) b.push({ type: "paragraph", text: "No rule-based recommendations were triggered by the data provided." });
    recs.forEach((x, i) => {
      b.push({ type: "heading", level: 3, text: `${i + 1}. ${x.title}` });
      b.push({ type: "paragraph", text: x.text });
    });
    sec("recommendations", "Value-enhancement recommendations", b, false);
  }

  /* ---------------- Assumptions & sources ---------------- */
  {
    const b: Block[] = [];
    const srcById = new Map(ctx.sources.map((s) => [s.id, s]));
    const rows: TableRow[] = [];
    let lastSection = "";
    for (const a of r.assumptions) {
      if (a.section !== lastSection) {
        lastSection = a.section;
        rows.push({ cells: [SECTION_LABELS[a.section] ?? humanize(a.section), "", "", "", ""], style: "group" });
      }
      const s = a.sourceId ? srcById.get(a.sourceId) : undefined;
      const kind = CATALOGUE_BY_KEY[a.key]?.kind;
      const srcText = s
        ? `${s.title}${s.publisher ? `, ${s.publisher}` : ""} (${fmtDate(s.publishedDate ?? a.asOf ?? s.accessedAt)})`
        : a.sourceId
          ? `Source ${a.sourceId}`
          : a.origin === "missing"
            ? "n/a"
            : kind === "market"
              ? "No source cited"
              : a.origin === "derived"
                ? "Derived from client data"
                : a.origin === "default"
                  ? "System default"
                  : "Advisor judgement";
      rows.push({
        cells: [a.label, fmtByUnit(a.value, a.unit), ORIGIN_LABELS[a.origin] ?? humanize(a.origin), srcText, a.stale ? "Stale" : a.value === null ? "" : "Current"],
        style: a.value === null ? "muted" : undefined,
      });
    }
    b.push({ type: "paragraph", text: "All assumptions used by the model, with their value, origin and source. Market data older than 30 days at the reference date is flagged as stale." });
    b.push({
      type: "table",
      small: true,
      columns: [L("Assumption", 3.1), R("Value", 1.45), L("Origin", 0.9), L("Source (date)", 2.5), L("Status", 0.7)],
      rows,
    });
    b.push({ type: "heading", level: 3, text: "Sources" });
    if (ctx.sources.length)
      b.push({
        type: "table",
        small: true,
        columns: [L("Title", 2.6), L("Publisher", 1.3), L("Kind", 0.9), L("Published", 1.1), L("Accessed", 1.1), L("URL", 2)],
        rows: ctx.sources.map((s) => ({
          cells: [s.title, s.publisher ?? "n/a", humanize(s.kind), s.publishedDate ? fmtDate(s.publishedDate) : "n/a", fmtDate(s.accessedAt), s.url ?? "n/a"],
        })),
      });
    else b.push({ type: "paragraph", text: "No sources recorded." });
    sec("assumptions", "Assumptions and sources", b, true);
  }

  /* ---------------- Open Items ---------------- */
  {
    const open = openItemsActive(r);
    const b: Block[] = [];
    if (!open.length) {
      b.push({ type: "paragraph", text: "There are no open items. All required inputs are present, sourced and confirmed, or have been formally waived." });
    } else {
      const blocking = open.filter((i) => i.severity === "blocking").length;
      b.push({
        type: "paragraph",
        text: `${open.length} open item${open.length === 1 ? "" : "s"} (${blocking} blocking). ${blocking ? "While blocking items remain, the valuation is provisional." : "Warnings do not prevent finalisation but should be reviewed."}`,
      });
      b.push({
        type: "table",
        small: true,
        columns: [L("Severity", 0.9), L("Category", 1.4), L("Item", 5)],
        rows: [...open]
          .sort((a, c) => (a.severity === c.severity ? 0 : a.severity === "blocking" ? -1 : 1))
          .map((i) => ({ cells: [humanize(i.severity), humanize(i.category), i.message] })),
      });
    }
    const waived = r.openItems.filter((i) => i.waived);
    if (waived.length) {
      b.push({ type: "heading", level: 3, text: "Waived items" });
      b.push({ type: "table", small: true, columns: [L("Category", 1.4), L("Item", 5.9)], rows: waived.map((i) => ({ cells: [humanize(i.category), i.message] })) });
    }
    sec("open_items", "Open Items", b, true);
  }

  /* ---------------- Limitations ---------------- */
  sec(
    "limitations",
    "Limitations",
    [
      {
        type: "bullets",
        items: [
          "Financial and operating information was provided by management and has not been audited or independently verified by us.",
          "Forecasts are based on management's plans and our assumptions; actual results will differ and the differences may be material.",
          "Market data is as at the dates shown in the assumptions and sources schedule. Values may change with market conditions after the valuation date.",
          "Comparable multiples are drawn from the sources cited; differences in size, location, format and transaction terms limit their comparability.",
          "The value conclusion applies only to the stated purpose, scope, standard and premise of value, and at the valuation date.",
          "No legal, tax, property or environmental due diligence has been performed.",
        ],
      },
    ],
    true,
  );

  /* ---------------- Disclaimer ---------------- */
  {
    const b: Block[] = disclaimerParagraphs(ctx).map((t) => ({ type: "paragraph" as const, text: t }));
    b.push({
      type: "kv",
      items: [
        { label: "Prepared by", value: `${ctx.branding.advisorName}, ${ctx.branding.firmName}` },
        ...(ctx.branding.contactEmail ? [{ label: "Contact", value: ctx.branding.contactEmail }] : []),
        { label: "Report generated", value: fmtDate(ctx.generatedAt) },
        { label: "Run reference", value: ctx.runId },
        { label: "Engine version", value: r.engineVersion },
      ],
    });
    sec("disclaimer", "Disclaimer", b, false);
  }

  return {
    cover,
    sections,
    footerText: ctx.branding.footerText,
    runningTitle: `${e.clientName} | ${e.title}`,
    palette: charts.palette,
    typeface: ctx.branding.typeface,
    provisional,
  };
}
