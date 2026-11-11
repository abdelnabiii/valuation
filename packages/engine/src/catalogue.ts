/**
 * Assumption catalogue: the single list of every assumption the engine reads.
 * Used by the engine, the admin UI, the Excel Inputs sheet and the seed.
 *
 * - kind "market": must come from a cited source (macro data, salary surveys,
 *   size premia). No default value is ever supplied.
 * - kind "judgement": advisor judgement. A starting default is offered but it
 *   stays an open item until the advisor confirms it.
 * - kind "derived": computed from client data when not overridden.
 */

export type AssumptionKind = "market" | "judgement" | "derived";
export type AssumptionUnit = "pct" | "egp" | "x" | "count" | "ratio" | "egp_per_usd";

export interface CatalogueEntry {
  key: string;
  label: string;
  section:
    | "macro"
    | "discount_rate"
    | "normalization"
    | "unit_economics"
    | "forecast"
    | "scenarios"
    | "multiples"
    | "asset_floor"
    | "adjustments"
    | "reconciliation"
    | "nav"
    | "early_stage";
  unit: AssumptionUnit;
  kind: AssumptionKind;
  /** Only for judgement entries. */
  default?: number;
  optional?: boolean;
  help?: string;
}

const scenarioEntries = (
  s: "base" | "upside" | "downside",
  d: { sss: number; margin: number },
): CatalogueEntry[] => [
  {
    key: `dcf.${s}.sss_real`,
    label: `${cap(s)}: real same-store sales growth p.a.`,
    section: "scenarios",
    unit: "pct",
    kind: "judgement",
    default: d.sss,
    help: "Growth above EGP inflation for existing units.",
  },
  {
    key: `dcf.${s}.margin_delta`,
    label: `${cap(s)}: EBITDA margin change by year 5 (pp)`,
    section: "scenarios",
    unit: "pct",
    kind: "judgement",
    default: d.margin,
    help: "Linear change from the normalized margin, reached in year 5.",
  },
  ...[1, 2, 3, 4, 5].map(
    (y): CatalogueEntry => ({
      key: `dcf.${s}.growth_y${y}`,
      label: `${cap(s)}: real revenue growth, year ${y}`,
      section: "scenarios",
      unit: "pct",
      kind: "derived",
      default: d.sss,
      help: "Growth above EGP inflation. Derived from the client's plan where given.",
    }),
  ),
  ...[1, 2, 3, 4, 5].map(
    (y): CatalogueEntry => ({
      key: `dcf.${s}.new_units_y${y}`,
      label: `${cap(s)}: new units opened in year ${y}`,
      section: "scenarios",
      unit: "count",
      kind: "derived",
      default: 0,
      help: "Defaults to the client's growth plan for base/upside.",
    }),
  ),
];

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const CATALOGUE: CatalogueEntry[] = [
  /* Macro — always sourced, never defaulted */
  { key: "macro.us_rf", label: "US 10-year Treasury yield", section: "macro", unit: "pct", kind: "market" },
  { key: "macro.erp", label: "Mature-market equity risk premium", section: "macro", unit: "pct", kind: "market" },
  { key: "macro.crp_egypt", label: "Egypt country risk premium", section: "macro", unit: "pct", kind: "market" },
  { key: "macro.egp_tbill", label: "Egypt 12-month T-bill yield", section: "macro", unit: "pct", kind: "market" },
  ...[1, 2, 3, 4, 5].map(
    (y): CatalogueEntry => ({
      key: `macro.egp_inflation_y${y}`,
      label: `EGP CPI inflation forecast, year ${y}`,
      section: "macro",
      unit: "pct",
      kind: "market",
    }),
  ),
  { key: "macro.egp_inflation_lt", label: "EGP long-term inflation", section: "macro", unit: "pct", kind: "market" },
  { key: "macro.usd_inflation", label: "US long-term inflation", section: "macro", unit: "pct", kind: "market" },
  { key: "macro.fx_usd_egp", label: "USD/EGP spot rate at valuation date", section: "macro", unit: "egp_per_usd", kind: "market" },
  ...[1, 2, 3, 4, 5].map(
    (y): CatalogueEntry => ({
      key: `macro.fx_forecast_y${y}`,
      label: `USD/EGP forecast, year ${y} (optional; PPP if blank)`,
      section: "macro",
      unit: "egp_per_usd",
      kind: "market",
      optional: true,
    }),
  ),
  { key: "macro.tax_rate", label: "Egypt corporate income tax rate", section: "macro", unit: "pct", kind: "market" },
  { key: "macro.vat_rate", label: "Egypt VAT rate", section: "macro", unit: "pct", kind: "market" },

  /* Discount rate */
  { key: "dr.size_premium", label: "Size premium", section: "discount_rate", unit: "pct", kind: "market" },
  {
    key: "dr.csrp",
    label: "Company-specific risk premium",
    section: "discount_rate",
    unit: "pct",
    kind: "judgement",
    default: 0.03,
    help: "Do not duplicate risks discounted again in Adjustments.",
  },
  { key: "dr.debt_weight", label: "Target debt / capital", section: "discount_rate", unit: "pct", kind: "judgement", default: 0 },
  {
    key: "dr.kd_egp",
    label: "Pre-tax cost of debt (EGP)",
    section: "discount_rate",
    unit: "pct",
    kind: "market",
    optional: true,
    help: "Required only if target debt weight is above zero.",
  },

  /* Normalization */
  {
    key: "norm.market_manager_salary",
    label: "Market-rate general manager cost (annual, fully loaded)",
    section: "normalization",
    unit: "egp",
    kind: "market",
    help: "Replaces owner pay that is added back.",
  },

  /* Unit economics */
  { key: "unit.ramp_y1", label: "New unit year-1 sales as % of mature", section: "unit_economics", unit: "pct", kind: "derived", default: 0.65 },
  { key: "unit.ramp_y2", label: "New unit year-2 sales as % of mature", section: "unit_economics", unit: "pct", kind: "judgement", default: 0.9 },
  { key: "unit.new_unit_mature_sales", label: "Mature annual sales per new unit (today's prices)", section: "unit_economics", unit: "egp", kind: "derived" },
  { key: "unit.new_unit_capex", label: "Capex per new unit (today's prices)", section: "unit_economics", unit: "egp", kind: "derived" },

  /* Forecast mechanics */
  { key: "dcf.da_pct", label: "Depreciation & amortisation, % of revenue", section: "forecast", unit: "pct", kind: "judgement", default: 0.04 },
  { key: "dcf.maint_capex_pct", label: "Maintenance capex, % of revenue", section: "forecast", unit: "pct", kind: "judgement", default: 0.03 },
  { key: "dcf.nwc_pct", label: "Net working capital, % of incremental revenue", section: "forecast", unit: "pct", kind: "judgement", default: 0 },
  { key: "dcf.g_real_lt", label: "Terminal real growth", section: "forecast", unit: "pct", kind: "judgement", default: 0.01 },
  { key: "dcf.exit_multiple", label: "Exit EV/EBITDA multiple (year 5)", section: "forecast", unit: "x", kind: "derived", help: "Defaults to the comparables median." },
  { key: "dcf.tv_weight_gordon", label: "Weight on Gordon-growth terminal value", section: "forecast", unit: "pct", kind: "judgement", default: 0.5 },
  { key: "dcf.p_base", label: "Scenario probability: base", section: "scenarios", unit: "pct", kind: "judgement", default: 0.5 },
  { key: "dcf.p_upside", label: "Scenario probability: upside", section: "scenarios", unit: "pct", kind: "judgement", default: 0.25 },
  { key: "dcf.p_downside", label: "Scenario probability: downside", section: "scenarios", unit: "pct", kind: "judgement", default: 0.25 },
  ...scenarioEntries("base", { sss: 0.02, margin: 0 }),
  ...scenarioEntries("upside", { sss: 0.04, margin: 0.02 }),
  ...scenarioEntries("downside", { sss: -0.02, margin: -0.03 }),

  /* Multiples */
  { key: "mult.selected_ev_ebitda", label: "Selected EV/EBITDA (blank = median)", section: "multiples", unit: "x", kind: "derived", optional: true },
  { key: "mult.selected_ev_revenue", label: "Selected EV/Revenue (blank = median)", section: "multiples", unit: "x", kind: "derived", optional: true },
  { key: "mult.selected_price_sde", label: "Selected Price/SDE (blank = median)", section: "multiples", unit: "x", kind: "derived", optional: true },
  { key: "mult.w_ebitda", label: "Weight: EV/EBITDA", section: "multiples", unit: "pct", kind: "judgement", default: 0.6 },
  { key: "mult.w_revenue", label: "Weight: EV/Revenue", section: "multiples", unit: "pct", kind: "judgement", default: 0.2 },
  { key: "mult.w_sde", label: "Weight: Price/SDE", section: "multiples", unit: "pct", kind: "judgement", default: 0.2 },

  /* Asset floor */
  { key: "asset.resale_equipment", label: "Resale value: equipment (% of cost)", section: "asset_floor", unit: "pct", kind: "judgement", default: 0.35 },
  { key: "asset.resale_fit_out", label: "Resale value: fit-out (% of cost)", section: "asset_floor", unit: "pct", kind: "judgement", default: 0.05 },
  { key: "asset.resale_furniture", label: "Resale value: furniture (% of cost)", section: "asset_floor", unit: "pct", kind: "judgement", default: 0.15 },
  { key: "asset.resale_other", label: "Resale value: other (% of cost)", section: "asset_floor", unit: "pct", kind: "judgement", default: 0.1 },
  { key: "asset.inventory_recovery", label: "Inventory recovery (% of book)", section: "asset_floor", unit: "pct", kind: "judgement", default: 0.5 },
  { key: "asset.liquidation_cost", label: "Liquidation costs (% of gross)", section: "asset_floor", unit: "pct", kind: "judgement", default: 0.1 },

  /* Adjustments — defaults are derived from intake by rules, then confirmed */
  { key: "adj.dlom", label: "Discount for lack of marketability", section: "adjustments", unit: "pct", kind: "judgement", default: 0.2 },
  { key: "adj.key_person", label: "Key-person dependency discount", section: "adjustments", unit: "pct", kind: "derived" },
  { key: "adj.lease_risk", label: "Lease risk discount", section: "adjustments", unit: "pct", kind: "derived" },
  { key: "adj.delivery", label: "Platform / channel reliance discount", section: "adjustments", unit: "pct", kind: "derived" },
  { key: "adj.fx", label: "FX exposure discount (imported inputs / equipment)", section: "adjustments", unit: "pct", kind: "derived" },
  { key: "adj.concentration", label: "Customer concentration discount", section: "adjustments", unit: "pct", kind: "derived" },

  /* Reconciliation */
  { key: "rec.w_dcf", label: "Weight: DCF", section: "reconciliation", unit: "pct", kind: "derived" },
  { key: "rec.w_multiples", label: "Weight: Multiples", section: "reconciliation", unit: "pct", kind: "derived" },
  { key: "rec.w_asset", label: "Weight: Asset floor", section: "reconciliation", unit: "pct", kind: "derived" },
  { key: "rec.w_nav", label: "Weight: Net asset value", section: "reconciliation", unit: "pct", kind: "derived" },
  { key: "rec.w_income", label: "Weight: Income capitalisation", section: "reconciliation", unit: "pct", kind: "derived" },
  { key: "rec.w_vc", label: "Weight: Venture capital method", section: "reconciliation", unit: "pct", kind: "derived" },
  { key: "rec.w_scorecard", label: "Weight: Scorecard method", section: "reconciliation", unit: "pct", kind: "derived" },
  { key: "rec.w_round", label: "Weight: Recent funding round", section: "reconciliation", unit: "pct", kind: "derived" },

  /* Asset-heavy: net asset value and income capitalisation */
  { key: "nav.cap_rate", label: "Capitalisation rate (net operating income yield)", section: "nav", unit: "pct", kind: "market", help: "From recent comparable property transactions or valuer reports." },
  { key: "nav.cap_rate_spread", label: "Cap rate range for low/high (± pp)", section: "nav", unit: "pct", kind: "judgement", default: 0.01 },

  /* Early stage: VC method, scorecard, funding round */
  { key: "vc.exit_revenue", label: "Revenue in the exit year (client plan)", section: "early_stage", unit: "egp", kind: "derived" },
  { key: "vc.exit_years", label: "Years to exit", section: "early_stage", unit: "count", kind: "derived", default: 5 },
  { key: "vc.exit_multiple", label: "Exit EV/Revenue multiple", section: "early_stage", unit: "x", kind: "derived", help: "Defaults to the comparables median EV/Revenue." },
  { key: "vc.target_return", label: "Target investor return (annual)", section: "early_stage", unit: "pct", kind: "judgement", default: 0.4 },
  { key: "vc.retention", label: "Retention after future dilution", section: "early_stage", unit: "pct", kind: "judgement", default: 0.7 },
  { key: "sc.base_premoney", label: "Median pre-money of comparable funded startups (EGP)", section: "early_stage", unit: "egp", kind: "market" },
  ...(
    [
      ["team", "Team", 0.3],
      ["market", "Size of the opportunity", 0.25],
      ["product", "Product / technology", 0.15],
      ["competition", "Competitive environment", 0.1],
      ["sales", "Marketing, sales and partnerships", 0.1],
      ["funding", "Need for further funding", 0.05],
      ["other", "Other factors", 0.05],
    ] as const
  ).flatMap(([k, l, w]): CatalogueEntry[] => [
    { key: `sc.w_${k}`, label: `Scorecard weight: ${l}`, section: "early_stage", unit: "pct", kind: "judgement", default: w },
    { key: `sc.s_${k}`, label: `Scorecard score: ${l} (100% = typical)`, section: "early_stage", unit: "pct", kind: "judgement", default: 1 },
  ]),
  { key: "round.post_money", label: "Post-money value of the latest priced round (EGP)", section: "early_stage", unit: "egp", kind: "derived" },
  { key: "round.adjustment", label: "Change in value since the round", section: "early_stage", unit: "pct", kind: "judgement", default: 0 },
  { key: "rec.rounding", label: "Rounding of final range (EGP)", section: "reconciliation", unit: "egp", kind: "judgement", default: 100000 },
];

export const CATALOGUE_BY_KEY: Record<string, CatalogueEntry> = Object.fromEntries(
  CATALOGUE.map((e) => [e.key, e]),
);

export const STALE_DAYS = 30;

export const SCORECARD_FACTORS = ["team", "market", "product", "competition", "sales", "funding", "other"] as const;

/**
 * Whether an assumption matters for a given forecast model and method set.
 * Irrelevant assumptions are still resolved (the Excel model references every
 * key) but never raise open items and are hidden in the UI.
 */
export function isRelevant(key: string, model: string, methods: string[]): boolean {
  const has = (m: string) => methods.includes(m);
  const early = model === "early_stage";
  if (key.startsWith("unit.") || /^dcf\.\w+\.(sss_real|new_units_y\d)$/.test(key)) return model === "units";
  if (/^dcf\.\w+\.growth_y\d$/.test(key)) return model === "operating" || model === "asset_heavy";
  if (key === "macro.fx_usd_egp" || key === "macro.vat_rate") return true;
  if (key.startsWith("macro.") || key.startsWith("dr.") || key.startsWith("dcf.") || key.startsWith("norm.")) return !early;
  if (key.startsWith("mult.w_")) return has("multiples");
  if (key.startsWith("asset.")) return !early;
  if (key === "adj.delivery") return model === "units";
  if (key === "adj.lease_risk") return model === "units" || model === "operating";
  if (key === "adj.concentration") return model !== "units";
  if (key.startsWith("rec.w_")) {
    const m = key.slice(6);
    return has(m === "income" ? "income_cap" : m);
  }
  if (key.startsWith("nav.")) return model === "asset_heavy";
  if (key.startsWith("vc.") || key.startsWith("sc.") || key.startsWith("round.")) return early;
  return true;
}
