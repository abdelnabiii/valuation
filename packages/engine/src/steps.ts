import { CATALOGUE } from "./catalogue";
import type { Ctx } from "./context";
import { runForecast, type ForecastParams } from "./forecast";
import { median, monthsBetween, percentileInc, roundTo, safeDiv, sum } from "./math";
import {
  CHANNELS,
  SCENARIOS,
  UNIT_COST_LINES,
  type AdjustmentsResult,
  type AssetFloorResult,
  type BridgeResult,
  type Channel,
  type CostLine,
  type DcfResult,
  type DiscountRateResult,
  type MethodRange,
  type MultipleStats,
  type MultiplesResult,
  type NormalizationResult,
  type OpenItem,
  type ReconciliationResult,
  type ResolvedAssumption,
  type Scenario,
  type ScenarioResult,
  type SensitivityGrid,
  type UnitEconomicsResult,
  type UnitEconomicsRow,
} from "./types";

/* ------------------------------------------------------------------ */
/* 1. Normalization                                                    */
/* ------------------------------------------------------------------ */

export function normalize(ctx: Ctx): NormalizationResult {
  const { units, headOfficeCosts, addbacks } = ctx.input;
  const revenueByChannel = Object.fromEntries(
    CHANNELS.map((c) => [c, sum(units.map((u) => u.ttmRevenue[c] ?? 0))]),
  ) as Record<Channel, number>;
  const revenue = sum(CHANNELS.map((c) => revenueByChannel[c]));
  const costs = Object.fromEntries(
    UNIT_COST_LINES.map((l) => [l, sum(units.map((u) => u.ttmCosts[l] ?? 0))]),
  ) as Record<CostLine | "head_office", number>;
  costs.head_office = headOfficeCosts;
  const totalCosts = sum([...UNIT_COST_LINES.map((l) => costs[l]), headOfficeCosts]);
  const reportedEbitda = revenue - totalCosts;
  const totalAddbacks = sum(addbacks.map((a) => a.amount));
  const ownerPayAddback = sum(addbacks.filter((a) => a.kind === "owner_pay").map((a) => a.amount));
  const marketManagerSalary = ctx.n("norm.market_manager_salary");
  const sde = reportedEbitda + totalAddbacks;
  const normalizedEbitda = sde - marketManagerSalary;
  return {
    revenue,
    revenueByChannel,
    costs,
    totalCosts,
    reportedEbitda,
    reportedMargin: safeDiv(reportedEbitda, revenue),
    addbacks: addbacks.map((a) => ({ ...a })),
    totalAddbacks,
    ownerPayAddback,
    marketManagerSalary,
    sde,
    normalizedEbitda,
    normalizedMargin: safeDiv(normalizedEbitda, revenue),
  };
}

/* ------------------------------------------------------------------ */
/* 2. Unit economics                                                   */
/* ------------------------------------------------------------------ */

export function unitEconomics(ctx: Ctx): UnitEconomicsResult {
  const { units, meta } = ctx.input;
  const rows: UnitEconomicsRow[] = units.map((u) => {
    const sales = sum(CHANNELS.map((c) => u.ttmRevenue[c] ?? 0));
    const cogs = u.ttmCosts.cogs ?? 0;
    const labour = u.ttmCosts.labour ?? 0;
    const rent = u.ttmCosts.rent ?? 0;
    const allCosts = sum(UNIT_COST_LINES.map((l) => u.ttmCosts[l] ?? 0));
    const fourWallEbitda = sales - allCosts;
    const investment = sum(u.capex.map((c) => c.cost));
    const monthsOpen = u.openedOn ? monthsBetween(u.openedOn, meta.valuationDate) : null;
    const annualisedSales = u.ttmMonths > 0 ? (sales * 12) / u.ttmMonths : 0;
    const annualisedFourWall = u.ttmMonths > 0 ? (fourWallEbitda * 12) / u.ttmMonths : 0;
    let observedRampY1: number | null = null;
    const m = [...u.monthlyRevenue].sort((a, b) => a.monthIndex - b.monthIndex);
    const first12 = m.filter((x) => x.monthIndex >= 1 && x.monthIndex <= 12);
    if (first12.length === 12 && m.length >= 15) {
      const last3 = m.slice(-3);
      const avgLast = sum(last3.map((x) => x.amount)) / 3;
      if (avgLast > 0) observedRampY1 = sum(first12.map((x) => x.amount)) / 12 / avgLast;
    }
    return {
      id: u.id,
      name: u.name,
      monthsOpen,
      sales,
      annualisedSales,
      cogs,
      labour,
      primeCost: cogs + labour,
      primeCostPct: safeDiv(cogs + labour, sales),
      rent,
      rentPct: safeDiv(rent, sales),
      otherCosts: allCosts - cogs - labour - rent,
      fourWallEbitda,
      fourWallMargin: safeDiv(fourWallEbitda, sales),
      investment,
      paybackYears: investment > 0 && annualisedFourWall > 0 ? investment / annualisedFourWall : null,
      mature: monthsOpen !== null && monthsOpen >= 24 && u.ttmMonths === 12,
      observedRampY1,
    };
  });

  const mature = rows.filter((r) => r.mature);
  const pool = mature.length ? mature : rows;
  const derivedMatureSales = pool.length ? sum(pool.map((r) => r.annualisedSales)) / pool.length : null;
  const withCapex = rows.filter((r) => r.investment > 0);
  const derivedCapex = withCapex.length ? sum(withCapex.map((r) => r.investment)) / withCapex.length : null;
  const observedRamps = rows.map((r) => r.observedRampY1).filter((x): x is number => x !== null);
  const observedRampY1 = observedRamps.length ? sum(observedRamps) / observedRamps.length : null;

  const newUnitMatureSales = ctx.n("unit.new_unit_mature_sales", derivedMatureSales, "Average annualised sales of mature units");
  const newUnitCapex = ctx.n("unit.new_unit_capex", derivedCapex, "Average recorded capex per unit");
  const rampY1 = ctx.n("unit.ramp_y1", observedRampY1, observedRampY1 !== null ? "Observed from units with 15+ months of history" : undefined);
  const rampY2 = ctx.n("unit.ramp_y2");
  const newUnitFourWallMargin = pool.length ? sum(pool.map((r) => r.fourWallMargin)) / pool.length : 0;
  const nwFour = newUnitMatureSales * newUnitFourWallMargin;
  const totalsSales = sum(rows.map((r) => r.sales));
  const totalsFour = sum(rows.map((r) => r.fourWallEbitda));
  return {
    rows,
    totals: {
      sales: totalsSales,
      fourWallEbitda: totalsFour,
      fourWallMargin: safeDiv(totalsFour, totalsSales),
      investment: sum(rows.map((r) => r.investment)),
    },
    newUnitMatureSales,
    newUnitCapex,
    newUnitFourWallMargin,
    newUnitPaybackYears: nwFour > 0 && newUnitCapex > 0 ? newUnitCapex / nwFour : null,
    rampY1,
    rampY2,
    observedRampY1,
  };
}

/* ------------------------------------------------------------------ */
/* 3a. Discount rate                                                   */
/* ------------------------------------------------------------------ */

export const inflationPath = (ctx: Ctx) => [1, 2, 3, 4, 5].map((y) => ctx.n(`macro.egp_inflation_y${y}`));

export function discountRate(ctx: Ctx): DiscountRateResult {
  const method = ctx.input.meta.discountRateMethod;
  const rf = ctx.n("macro.us_rf");
  const erp = ctx.n("macro.erp");
  const crp = ctx.n("macro.crp_egypt");
  const size = ctx.n("dr.size_premium");
  const csrp = ctx.n("dr.csrp");
  const tbill = ctx.n("macro.egp_tbill");
  const piUs = ctx.n("macro.usd_inflation");
  const piLt = ctx.n("macro.egp_inflation_lt");
  const infl = inflationPath(ctx);
  const tax = ctx.n("macro.tax_rate");
  const wd = ctx.n("dr.debt_weight");
  const kd = wd > 0 ? ctx.n("dr.kd_egp") : (ctx.a("dr.kd_egp") ?? 0);
  const kdAfterTax = kd * (1 - tax);
  const warnings: string[] = [];

  const costOfEquityUsd = rf + erp + crp + size + csrp;
  let keEgp: number[];
  let keEgpLt: number;
  const components =
    method === "usd_buildup"
      ? [
          { key: "macro.us_rf", label: "US risk-free rate", value: rf },
          { key: "macro.erp", label: "Equity risk premium", value: erp },
          { key: "macro.crp_egypt", label: "Egypt country risk premium", value: crp },
          { key: "dr.size_premium", label: "Size premium", value: size },
          { key: "dr.csrp", label: "Company-specific premium", value: csrp },
        ]
      : [
          { key: "macro.egp_tbill", label: "Egypt T-bill yield", value: tbill },
          { key: "macro.erp", label: "Equity risk premium", value: erp },
          { key: "macro.crp_egypt", label: "Egypt country risk premium", value: crp },
          { key: "dr.size_premium", label: "Size premium", value: size },
          { key: "dr.csrp", label: "Company-specific premium", value: csrp },
        ];

  if (method === "usd_buildup") {
    keEgp = infl.map((pi) => ((1 + costOfEquityUsd) * (1 + pi)) / (1 + piUs) - 1);
    keEgpLt = ((1 + costOfEquityUsd) * (1 + piLt)) / (1 + piUs) - 1;
  } else {
    const k = tbill + erp + crp + size + csrp;
    keEgp = infl.map(() => k);
    keEgpLt = k;
    warnings.push(
      "EGP T-bill yield already prices Egypt sovereign risk; adding the country risk premium on top may double-count it.",
    );
  }
  const waccEgp = keEgp.map((k) => (1 - wd) * k + wd * kdAfterTax);
  const waccEgpTerminal = (1 - wd) * keEgpLt + wd * kdAfterTax;
  const waccUsd = ((1 + waccEgpTerminal) * (1 + piUs)) / (1 + piLt) - 1;
  return { method, components, costOfEquityUsd, waccEgp, waccEgpTerminal, waccUsd, warnings };
}

/* ------------------------------------------------------------------ */
/* 3b. DCF                                                             */
/* ------------------------------------------------------------------ */

export function forecastParams(
  ctx: Ctx,
  s: Scenario,
  norm: NormalizationResult,
  ue: UnitEconomicsResult,
  dr: DiscountRateResult,
  exitMultiple: number,
): ForecastParams {
  return {
    scenario: s,
    baseRevenue: norm.revenue,
    baseMargin: norm.normalizedMargin,
    inflation: inflationPath(ctx),
    sssReal: ctx.n(`dcf.${s}.sss_real`),
    marginDelta: ctx.n(`dcf.${s}.margin_delta`),
    marginShift: 0,
    newUnits: [1, 2, 3, 4, 5].map((y) => ctx.n(`dcf.${s}.new_units_y${y}`, derivedNewUnits(ctx, s, y))),
    matureSales: ue.newUnitMatureSales,
    capexPerUnit: ue.newUnitCapex,
    rampY1: ue.rampY1,
    rampY2: ue.rampY2,
    daPct: ctx.n("dcf.da_pct"),
    maintCapexPct: ctx.n("dcf.maint_capex_pct"),
    nwcPct: ctx.n("dcf.nwc_pct"),
    taxRate: ctx.n("macro.tax_rate"),
    rates: dr.waccEgp,
    terminalRate: dr.waccEgpTerminal,
    gRealLt: ctx.n("dcf.g_real_lt"),
    inflationLt: ctx.n("macro.egp_inflation_lt"),
    exitMultiple,
    tvWeightGordon: ctx.n("dcf.tv_weight_gordon"),
  };
}

function derivedNewUnits(ctx: Ctx, s: Scenario, y: number): number {
  const plan = ctx.input.growthPlan.newUnitsByYear[y - 1] ?? 0;
  if (s === "downside") return Math.floor(plan / 2);
  return plan;
}

const DCF_REQUIRED = [
  "macro.us_rf",
  "macro.erp",
  "macro.crp_egypt",
  "macro.egp_inflation_y1",
  "macro.egp_inflation_y2",
  "macro.egp_inflation_y3",
  "macro.egp_inflation_y4",
  "macro.egp_inflation_y5",
  "macro.egp_inflation_lt",
  "macro.usd_inflation",
  "macro.tax_rate",
  "macro.fx_usd_egp",
  "dr.size_premium",
  "norm.market_manager_salary",
];

export function dcf(
  ctx: Ctx,
  norm: NormalizationResult,
  ue: UnitEconomicsResult,
  dr: DiscountRateResult,
  compsMedianEbitda: number | null,
): DcfResult {
  const weights = {
    base: ctx.n("dcf.p_base"),
    upside: ctx.n("dcf.p_upside"),
    downside: ctx.n("dcf.p_downside"),
  };
  const exitMultiple = ctx.a("dcf.exit_multiple", compsMedianEbitda, "Median EV/EBITDA of included comparables");
  const required = [...DCF_REQUIRED];
  if (ctx.input.meta.discountRateMethod === "egp_tbill") required.push("macro.egp_tbill");
  const missing = required.filter((k) => !ctx.has(k));
  if (exitMultiple === null) missing.push("dcf.exit_multiple");
  if (norm.revenue <= 0) missing.push("revenue");
  // Always resolve scenario assumptions so they appear in the log.
  const params = Object.fromEntries(
    SCENARIOS.map((s) => [s, forecastParams(ctx, s, norm, ue, dr, exitMultiple ?? 0)]),
  ) as Record<Scenario, ForecastParams>;

  if (missing.length) {
    return {
      available: false,
      reason: `Missing inputs: ${missing.join(", ")}`,
      scenarios: null,
      weights,
      weightedEv: 0,
      usdCrossCheck: null,
    };
  }
  const g = (1 + ctx.n("dcf.g_real_lt")) * (1 + ctx.n("macro.egp_inflation_lt")) - 1;
  if (dr.waccEgpTerminal <= g) {
    return {
      available: false,
      reason: "Terminal discount rate must exceed terminal growth.",
      scenarios: null,
      weights,
      weightedEv: 0,
      usdCrossCheck: null,
    };
  }

  const scenarios = Object.fromEntries(SCENARIOS.map((s) => [s, runForecast(params[s])])) as Record<
    Scenario,
    ScenarioResult
  >;
  const weightedEv =
    weights.base * scenarios.base.ev + weights.upside * scenarios.upside.ev + weights.downside * scenarios.downside.ev;

  // USD cross-check on the base scenario.
  const fx0 = ctx.n("macro.fx_usd_egp");
  const piUs = ctx.n("macro.usd_inflation");
  const forecastFx = [1, 2, 3, 4, 5].map((y) => ctx.a(`macro.fx_forecast_y${y}`));
  const useForecast = forecastFx.every((x) => x !== null && x > 0);
  const base = scenarios.base;
  const fx = base.years.map((y, i) =>
    useForecast ? (forecastFx[i] as number) : (fx0 * y.priceIndex) / (1 + piUs) ** y.year,
  );
  const fcffUsd = base.years.map((y, i) => y.fcff / fx[i]!);
  const ru = dr.waccUsd;
  const pvUsd = sum(fcffUsd.map((f, i) => f / (1 + ru) ** (i + 0.5)));
  const w = ctx.n("dcf.tv_weight_gordon");
  const tvBlend = w * base.tvGordon + (1 - w) * base.tvExit;
  const evUsd = pvUsd + tvBlend / fx[4]! / (1 + ru) ** 5;
  const evUsdInEgp = evUsd * fx0;
  return {
    available: true,
    scenarios,
    weights,
    weightedEv,
    usdCrossCheck: {
      fx,
      fcffUsd,
      evUsd,
      evUsdInEgp,
      differencePct: safeDiv(evUsdInEgp, base.ev) - 1,
      fxBasis: useForecast ? "forecast" : "ppp",
    },
  };
}

/* ------------------------------------------------------------------ */
/* 4. Multiples                                                        */
/* ------------------------------------------------------------------ */

export function compsMedian(ctx: Ctx, metric: "evToEbitda" | "evToRevenue" | "priceToSde"): number | null {
  const v = ctx.input.comparables
    .filter((c) => c.included && c.sourceId && c[metric] !== null && Number.isFinite(c[metric]))
    .map((c) => c[metric] as number);
  return median(v);
}

export function multiples(ctx: Ctx, norm: NormalizationResult): MultiplesResult {
  const comps = ctx.input.comparables.filter((c) => c.included && !!c.sourceId);
  const defs = [
    { metric: "ev_ebitda" as const, field: "evToEbitda" as const, base: norm.normalizedEbitda, sel: "mult.selected_ev_ebitda", w: "mult.w_ebitda" },
    { metric: "ev_revenue" as const, field: "evToRevenue" as const, base: norm.revenue, sel: "mult.selected_ev_revenue", w: "mult.w_revenue" },
    { metric: "price_sde" as const, field: "priceToSde" as const, base: norm.sde, sel: "mult.selected_price_sde", w: "mult.w_sde" },
  ];
  const stats: MultipleStats[] = defs.map((d) => {
    const vals = comps.map((c) => c[d.field]).filter((x): x is number => x !== null && Number.isFinite(x));
    const q1 = percentileInc(vals, 0.25);
    const med = percentileInc(vals, 0.5);
    const q3 = percentileInc(vals, 0.75);
    const selected = ctx.a(d.sel, med, "Median of included comparables");
    const weight = ctx.n(d.w);
    const usable = vals.length > 0 && d.base > 0 && selected !== null;
    return {
      metric: d.metric,
      count: vals.length,
      q1,
      median: med,
      q3,
      selected,
      base: d.base,
      low: usable ? d.base * q1! : null,
      mid: usable ? d.base * selected! : null,
      high: usable ? d.base * q3! : null,
      weight: usable ? weight : 0,
    };
  });
  const tw = sum(stats.map((s) => s.weight));
  if (tw <= 0) {
    return {
      available: false,
      reason: comps.length === 0 ? "No sourced comparables included." : "No usable multiple (check earnings base and weights).",
      stats,
      low: 0,
      mid: 0,
      high: 0,
    };
  }
  const agg = (k: "low" | "mid" | "high") => sum(stats.map((s) => (s.weight / tw) * (s[k] ?? 0)));
  return { available: true, stats, low: agg("low"), mid: agg("mid"), high: agg("high") };
}

/* ------------------------------------------------------------------ */
/* 6. Asset floor                                                      */
/* ------------------------------------------------------------------ */

const ASSET_CATS = ["equipment", "fit_out", "furniture", "other"] as const;

export function assetFloor(ctx: Ctx): AssetFloorResult {
  const items = ctx.input.units.flatMap((u) => u.capex);
  const rows = ASSET_CATS.map((cat) => {
    const cost = sum(items.filter((i) => i.category === cat).map((i) => i.cost));
    const resalePct = ctx.n(`asset.resale_${cat}`);
    return { category: cat, cost, resalePct, value: cost * resalePct };
  });
  const inventory = ctx.input.operations.inventoryValue ?? 0;
  const inventoryRecoveryPct = ctx.n("asset.inventory_recovery");
  const inventoryValue = inventory * inventoryRecoveryPct;
  const gross = sum(rows.map((r) => r.value)) + inventoryValue;
  const liquidationCostPct = ctx.n("asset.liquidation_cost");
  const liquidationCost = gross * liquidationCostPct;
  return {
    rows,
    inventory,
    inventoryRecoveryPct,
    inventoryValue,
    gross,
    liquidationCostPct,
    liquidationCost,
    floor: gross - liquidationCost,
  };
}

/* ------------------------------------------------------------------ */
/* 7. Adjustments                                                      */
/* ------------------------------------------------------------------ */

export function suggestKeyPerson(score: number | null): number | null {
  if (score === null) return null;
  const s = Math.min(5, Math.max(1, Math.round(score)));
  return (s - 1) * 0.025;
}

export function suggestLeaseRisk(weightedYears: number | null): number | null {
  if (weightedYears === null) return null;
  if (weightedYears < 2) return 0.075;
  if (weightedYears < 4) return 0.04;
  if (weightedYears < 6) return 0.02;
  return 0;
}

export function suggestDelivery(share: number): number {
  if (share > 0.5) return 0.075;
  if (share > 0.35) return 0.05;
  if (share > 0.2) return 0.025;
  return 0;
}

export function suggestFx(importedShare: number | null): number | null {
  if (importedShare === null) return null;
  if (importedShare > 0.6) return 0.04;
  if (importedShare > 0.3) return 0.02;
  if (importedShare > 0) return 0.01;
  return 0;
}

export function adjustments(ctx: Ctx, norm: NormalizationResult): AdjustmentsResult {
  const ops = ctx.input.operations;
  const units = ctx.input.units;
  // Revenue-weighted lease years remaining
  const withLease = units.filter((u) => u.lease?.yearsRemaining !== null && u.lease?.yearsRemaining !== undefined);
  const salesOf = (u: (typeof units)[number]) => sum(CHANNELS.map((c) => u.ttmRevenue[c] ?? 0));
  const wSales = sum(withLease.map(salesOf));
  const weightedYears =
    withLease.length && wSales > 0
      ? sum(withLease.map((u) => salesOf(u) * (u.lease!.yearsRemaining as number))) / wSales
      : null;
  const deliveryShare = safeDiv(norm.revenueByChannel.delivery, norm.revenue);

  const kpS = suggestKeyPerson(ops.ownerDependencyScore);
  const lrS = suggestLeaseRisk(weightedYears);
  const dS = suggestDelivery(deliveryShare);
  const fxS = suggestFx(ops.importedCogsShare);

  const dlom = ctx.n("adj.dlom");
  const kp = ctx.n("adj.key_person", kpS);
  const lr = ctx.n("adj.lease_risk", lrS);
  const dl = ctx.n("adj.delivery", dS);
  const fx = ctx.n("adj.fx", fxS);

  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const rows = [
    { key: "adj.dlom", label: "Marketability (DLOM)", pct: dlom, suggestedPct: 0.2, rationale: "Private company shares cannot be sold quickly or cheaply; advisor judgement." },
    {
      key: "adj.key_person",
      label: "Key-person dependency",
      pct: kp,
      suggestedPct: kpS ?? 0,
      rationale: ops.ownerDependencyScore === null ? "Owner dependency not provided." : `Owner dependency score ${ops.ownerDependencyScore}/5.`,
    },
    {
      key: "adj.lease_risk",
      label: "Lease risk",
      pct: lr,
      suggestedPct: lrS ?? 0,
      rationale: weightedYears === null ? "Lease terms not provided." : `Sales-weighted lease term remaining ${weightedYears.toFixed(1)} years.`,
    },
    { key: "adj.delivery", label: "Delivery-app reliance", pct: dl, suggestedPct: dS, rationale: `Delivery apps are ${pct(deliveryShare)} of TTM revenue.` },
    {
      key: "adj.fx",
      label: "FX exposure",
      pct: fx,
      suggestedPct: fxS ?? 0,
      rationale: ops.importedCogsShare === null ? "Imported share of COGS not provided." : `Imported inputs are ${pct(ops.importedCogsShare)} of COGS.`,
    },
  ];
  const combinedFactor = rows.reduce((f, r) => f * (1 - r.pct), 1);
  return { rows, combinedFactor, combinedDiscount: 1 - combinedFactor };
}

/* ------------------------------------------------------------------ */
/* Equity bridge                                                       */
/* ------------------------------------------------------------------ */

const BRIDGE_SIGN: Record<string, 1 | -1 | 0> = {
  bank_loan: -1,
  shareholder_loan: -1,
  overdraft: -1,
  other: -1,
  deposit_held: -1,
  lease_liability: 0,
  cash: 1,
  deposit_paid: 1,
};

export function bridge(ctx: Ctx): BridgeResult {
  const fx0 = ctx.n("macro.fx_usd_egp");
  const rows = ctx.input.bridge.map((b) => {
    const balanceEgp = b.currency === "USD" ? b.balance * fx0 : b.balance;
    const sign = BRIDGE_SIGN[b.kind] ?? -1;
    return {
      kind: b.kind,
      description: b.description,
      balance: b.balance,
      currency: b.currency,
      balanceEgp,
      sign,
      note: sign === 0 ? "Excluded: rent is already deducted in EBITDA." : undefined,
    };
  });
  return { rows, netAdjustment: sum(rows.map((r) => r.sign * r.balanceEgp)) };
}

/* ------------------------------------------------------------------ */
/* 5 + 8. Reconciliation (young-company weighting inside)              */
/* ------------------------------------------------------------------ */

export function reconcile(
  ctx: Ctx,
  d: DcfResult,
  m: MultiplesResult,
  a: AssetFloorResult,
  br: BridgeResult,
  adj: AdjustmentsResult,
): ReconciliationResult {
  const young = ctx.input.meta.monthsOfHistory < 36;
  const wDcf = ctx.n("rec.w_dcf", young ? 0.7 : 0.5);
  const wMult = ctx.n("rec.w_multiples", young ? 0.3 : 0.5);
  const wAsset = ctx.n("rec.w_asset", 0);
  const sc = d.scenarios;
  const methods: MethodRange[] = [
    {
      method: "dcf",
      label: "Discounted cash flow",
      available: d.available,
      low: sc ? sc.downside.ev : 0,
      mid: d.weightedEv,
      high: sc ? sc.upside.ev : 0,
      weight: d.available ? wDcf : 0,
    },
    { method: "multiples", label: "Market multiples", available: m.available, low: m.low, mid: m.mid, high: m.high, weight: m.available ? wMult : 0 },
    { method: "asset", label: "Asset-based floor", available: true, low: a.floor, mid: a.floor, high: a.floor, weight: wAsset },
  ];
  const tw = sum(methods.map((x) => x.weight));
  for (const x of methods) x.weight = tw > 0 ? x.weight / tw : 0;
  const agg = (k: "low" | "mid" | "high") => sum(methods.map((x) => x.weight * x[k]));
  const rawLow = agg("low");
  const rawMid = agg("mid");
  const rawHigh = agg("high");
  const evLow = Math.max(rawLow, a.floor);
  const evMid = Math.max(rawMid, a.floor);
  const evHigh = Math.max(rawHigh, a.floor);
  const floorApplied = rawLow < a.floor || rawMid < a.floor || rawHigh < a.floor;
  const net = br.netAdjustment;
  const f = adj.combinedFactor;
  const rounding = ctx.n("rec.rounding");
  const fx0 = ctx.a("macro.fx_usd_egp");
  const equityLow = evLow + net;
  const equityMid = evMid + net;
  const equityHigh = evHigh + net;
  const adjustedLow = equityLow * f;
  const adjustedMid = equityMid * f;
  const adjustedHigh = equityHigh * f;
  const roundedLow = roundTo(adjustedLow, rounding);
  const roundedMid = roundTo(adjustedMid, rounding);
  const roundedHigh = roundTo(adjustedHigh, rounding);
  const weightsRationale = young
    ? `Operating history is ${ctx.input.meta.monthsOfHistory} months (under 36): the unit-economics DCF carries more weight than market multiples, because trailing earnings do not yet reflect mature performance.`
    : `Operating history is ${ctx.input.meta.monthsOfHistory} months: DCF and market multiples are weighted equally by default.`;
  return {
    methods,
    youngCompany: young,
    weightsRationale,
    evLow,
    evMid,
    evHigh,
    floorApplied,
    equityLow,
    equityMid,
    equityHigh,
    adjustedLow,
    adjustedMid,
    adjustedHigh,
    roundedLow,
    roundedMid,
    roundedHigh,
    rounding,
    usdLow: fx0 ? roundedLow / fx0 : null,
    usdMid: fx0 ? roundedMid / fx0 : null,
    usdHigh: fx0 ? roundedHigh / fx0 : null,
  };
}

/* ------------------------------------------------------------------ */
/* 9. Sensitivities                                                    */
/* ------------------------------------------------------------------ */

export const SENS_RATE = [-0.02, -0.01, 0, 0.01, 0.02];
export const SENS_GROWTH = [-0.01, -0.005, 0, 0.005, 0.01];
export const SENS_MARGIN = [-0.02, -0.01, 0, 0.01, 0.02];
export const SENS_SSS = [-0.04, -0.02, 0, 0.02, 0.04];
export const SENS_UNITS = [-2, -1, 0, 1, 2];
export const SENS_CAPEX = [-0.2, -0.1, 0, 0.1, 0.2];

export function sensitivities(base: ForecastParams | null): SensitivityGrid[] {
  const grid = (
    key: string,
    title: string,
    rowLabel: string,
    colLabel: string,
    rows: number[],
    cols: number[],
    f: (r: number, c: number) => ForecastParams,
  ): SensitivityGrid => ({
    key,
    title,
    rowLabel,
    colLabel,
    rows,
    cols,
    values: base ? rows.map((r) => cols.map((c) => runForecast(f(r, c)).ev)) : [],
  });
  const b = base!;
  return [
    grid("rate_growth", "Discount rate vs terminal growth", "Discount rate shift", "Terminal real growth shift", SENS_RATE, SENS_GROWTH, (r, c) => ({
      ...b,
      rates: b.rates.map((x) => x + r),
      terminalRate: b.terminalRate + r,
      gRealLt: b.gRealLt + c,
    })),
    grid("margin_sss", "EBITDA margin vs same-store sales", "EBITDA margin shift", "Real SSS growth shift", SENS_MARGIN, SENS_SSS, (r, c) => ({
      ...b,
      marginShift: r,
      sssReal: b.sssReal + c,
    })),
    grid("units_capex", "New units vs capex per unit", "New units per year (change)", "Capex per unit (change)", SENS_UNITS, SENS_CAPEX, (r, c) => ({
      ...b,
      newUnits: b.newUnits.map((n) => Math.max(0, n + r)),
      capexPerUnit: b.capexPerUnit * (1 + c),
    })),
  ];
}

/* ------------------------------------------------------------------ */
/* Open items                                                          */
/* ------------------------------------------------------------------ */

export function openItems(
  ctx: Ctx,
  resolved: ResolvedAssumption[],
  parts: { dcf: DcfResult; multiples: MultiplesResult; dr: DiscountRateResult },
): OpenItem[] {
  const items: OpenItem[] = [];
  const byKey = Object.fromEntries(resolved.map((r) => [r.key, r]));
  const catalogue = Object.fromEntries(CATALOGUE.map((c) => [c.key, c]));
  const wd = byKey["dr.debt_weight"]?.value ?? 0;
  const fxForecastProvided = [1, 2, 3, 4, 5].some((y) => byKey[`macro.fx_forecast_y${y}`]?.value !== null);

  for (const r of resolved) {
    const c = catalogue[r.key]!;
    let optional = !!c.optional;
    if (r.key === "dr.kd_egp") optional = wd <= 0;
    if (r.key.startsWith("macro.fx_forecast_")) optional = !fxForecastProvided;
    if (r.key === "macro.egp_tbill" && ctx.input.meta.discountRateMethod === "usd_buildup") optional = true;
    if (r.key.startsWith("mult.selected_") && r.value === null) optional = true;

    if (r.value === null) {
      if (!optional)
        items.push({ key: `missing:${r.key}`, category: "missing_input", severity: "blocking", message: `${r.label}: no value.` });
      continue;
    }
    if (r.requiresSource && r.origin === "input") {
      if (!r.sourceId)
        items.push({ key: `source:${r.key}`, category: "missing_source", severity: "blocking", message: `${r.label}: no cited source.` });
      if (r.stale)
        items.push({
          key: `stale:${r.key}`,
          category: "stale",
          severity: "blocking",
          message: `${r.label}: source dated ${r.asOf ?? "unknown"} is older than 30 days. Refresh or waive.`,
        });
    }
    const inp = ctx.input.assumptions[r.key];
    if (inp?.isPlaceholder)
      items.push({ key: `placeholder:${r.key}`, category: "unconfirmed_assumption", severity: "blocking", message: `${r.label}: illustrative placeholder, not market data.` });
    if (r.origin === "default" && !optional)
      items.push({
        key: `confirm:${r.key}`,
        category: "unconfirmed_assumption",
        severity: "blocking",
        message: `${r.label}: system default ${fmt(r.value, r.unit)} not yet confirmed.`,
      });
    if (r.origin === "derived" && !optional)
      items.push({
        key: `confirm:${r.key}`,
        category: "unconfirmed_assumption",
        severity: "warning",
        message: `${r.label}: derived ${fmt(r.value, r.unit)}${r.note ? ` (${r.note})` : ""}; review.`,
      });
    if (r.origin === "input" && !r.confirmed && !optional)
      items.push({ key: `confirm:${r.key}`, category: "unconfirmed_assumption", severity: "blocking", message: `${r.label}: entered but not confirmed.` });
  }

  if (!parts.dcf.available)
    items.push({ key: "method:dcf", category: "method", severity: "blocking", message: `DCF not computed. ${parts.dcf.reason ?? ""}` });
  if (!parts.multiples.available)
    items.push({ key: "method:multiples", category: "method", severity: "blocking", message: `Multiples not computed. ${parts.multiples.reason ?? ""}` });
  for (const w of parts.dr.warnings) items.push({ key: "method:dr_double_count", category: "method", severity: "warning", message: w });
  if (ctx.input.meta.monthsOfHistory < 12)
    items.push({
      key: "data:short_history",
      category: "data_quality",
      severity: "warning",
      message: `Only ${ctx.input.meta.monthsOfHistory} months of operating history.`,
    });
  for (const d of ctx.input.dataIssues) items.push({ key: `data:${d.key}`, category: "data_quality", severity: d.severity, message: d.message });

  const waived = new Set(ctx.input.meta.waivedOpenItems);
  // De-duplicate by key
  const seen = new Set<string>();
  return items
    .filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)))
    .map((i) => (waived.has(i.key) ? { ...i, waived: true } : i));
}

function fmt(v: number | null, unit: string): string {
  if (v === null) return "n/a";
  if (unit === "pct") return `${(v * 100).toFixed(2)}%`;
  if (unit === "x") return `${v.toFixed(2)}x`;
  if (unit === "egp") return `EGP ${Math.round(v).toLocaleString("en-US")}`;
  return String(v);
}
