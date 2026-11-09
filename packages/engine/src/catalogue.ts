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
    | "reconciliation";
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
  { key: "adj.delivery", label: "Delivery-app reliance discount", section: "adjustments", unit: "pct", kind: "derived" },
  { key: "adj.fx", label: "FX exposure discount (imported beans / equipment)", section: "adjustments", unit: "pct", kind: "derived" },

  /* Reconciliation */
  { key: "rec.w_dcf", label: "Weight: DCF", section: "reconciliation", unit: "pct", kind: "derived" },
  { key: "rec.w_multiples", label: "Weight: Multiples", section: "reconciliation", unit: "pct", kind: "derived" },
  { key: "rec.w_asset", label: "Weight: Asset floor", section: "reconciliation", unit: "pct", kind: "derived" },
  { key: "rec.rounding", label: "Rounding of final range (EGP)", section: "reconciliation", unit: "egp", kind: "judgement", default: 100000 },
];

export const CATALOGUE_BY_KEY: Record<string, CatalogueEntry> = Object.fromEntries(
  CATALOGUE.map((e) => [e.key, e]),
);

export const STALE_DAYS = 30;
