import type { ForecastYear, Scenario, ScenarioResult } from "./types";

/**
 * Parameters for one 5-year forecast block. The Excel export writes exactly
 * the same block (same order of operations) for each scenario and for each
 * sensitivity cell, which is what lets the workbook reconcile to the cent.
 */
export interface ForecastParams {
  scenario: Scenario;
  baseRevenue: number; // TTM revenue, year 0
  baseMargin: number; // normalized EBITDA margin, year 0
  inflation: number[]; // EGP CPI, years 1..5
  /** Real growth of existing revenue, years 1..5 (same-store growth for multi-site). */
  growthReal: number[];
  marginDelta: number; // pp change reached in year 5
  marginShift: number; // parallel shift (sensitivities only)
  newUnits: number[]; // years 1..5
  matureSales: number; // per unit, today's prices
  capexPerUnit: number; // per unit, today's prices
  rampY1: number;
  rampY2: number;
  daPct: number;
  maintCapexPct: number;
  nwcPct: number;
  taxRate: number;
  rates: number[]; // nominal EGP discount rates, years 1..5
  terminalRate: number;
  gRealLt: number;
  inflationLt: number;
  exitMultiple: number;
  tvWeightGordon: number;
}

export function runForecast(p: ForecastParams): ScenarioResult {
  const years: ForecastYear[] = [];
  let priceIndex = 1;
  let existing = p.baseRevenue;
  let prevRevenue = p.baseRevenue;
  let cumulativeFactor = 1;
  let cumUnits = 0;
  const cumByYear: number[] = [0]; // cumulative units at end of year t (index t)

  for (let t = 1; t <= 5; t++) {
    const pi = p.inflation[t - 1]!;
    priceIndex = priceIndex * (1 + pi);
    existing = existing * (1 + p.growthReal[t - 1]!) * (1 + pi);
    const opened = p.newUnits[t - 1]!;
    cumUnits = cumUnits + opened;
    cumByYear.push(cumUnits);
    const openedPrev = t >= 2 ? p.newUnits[t - 2]! : 0;
    const matureCount = t >= 3 ? cumByYear[t - 2]! : 0;
    const newUnitRevenue =
      p.matureSales * priceIndex * (p.rampY1 * opened + p.rampY2 * openedPrev + matureCount);
    const revenue = existing + newUnitRevenue;
    const ebitdaMargin = p.baseMargin + p.marginShift + (p.marginDelta * t) / 5;
    const ebitda = revenue * ebitdaMargin;
    const da = revenue * p.daPct;
    const ebit = ebitda - da;
    const tax = Math.max(0, ebit) * p.taxRate;
    const expansionCapex = opened * p.capexPerUnit * priceIndex;
    const maintenanceCapex = revenue * p.maintCapexPct;
    const capex = expansionCapex + maintenanceCapex;
    const deltaNwc = p.nwcPct * (revenue - prevRevenue);
    const fcff = ebitda - tax - capex - deltaNwc;
    const r = p.rates[t - 1]!;
    const discountFactor = 1 / (cumulativeFactor * Math.sqrt(1 + r));
    cumulativeFactor = cumulativeFactor * (1 + r);
    const pv = fcff * discountFactor;

    years.push({
      year: t,
      egpInflation: pi,
      priceIndex,
      existingRevenue: existing,
      newUnitsOpened: opened,
      cumulativeNewUnits: cumUnits,
      newUnitRevenue,
      revenue,
      ebitdaMargin,
      ebitda,
      da,
      ebit,
      tax,
      expansionCapex,
      maintenanceCapex,
      capex,
      deltaNwc,
      fcff,
      discountRate: r,
      cumulativeFactor,
      discountFactor,
      pv,
    });
    prevRevenue = revenue;
  }

  const y5 = years[4]!;
  const sumPv = years.reduce((s, y) => s + y.pv, 0);
  const terminalGrowth = (1 + p.gRealLt) * (1 + p.inflationLt) - 1;
  const terminalFcff =
    (y5.ebitda - y5.tax - y5.maintenanceCapex) * (1 + terminalGrowth) - p.nwcPct * y5.revenue * terminalGrowth;
  const tvGordon = terminalFcff / (p.terminalRate - terminalGrowth);
  const tvExit = y5.ebitda * p.exitMultiple;
  const discountFactorEnd = 1 / y5.cumulativeFactor;
  const pvTvGordon = tvGordon * discountFactorEnd;
  const pvTvExit = tvExit * discountFactorEnd;
  const evGordon = sumPv + pvTvGordon;
  const evExit = sumPv + pvTvExit;
  const ev = p.tvWeightGordon * evGordon + (1 - p.tvWeightGordon) * evExit;
  const pvTvBlended = p.tvWeightGordon * pvTvGordon + (1 - p.tvWeightGordon) * pvTvExit;

  return {
    scenario: p.scenario,
    years,
    sumPv,
    terminalFcff,
    terminalGrowth,
    tvGordon,
    tvExit,
    discountFactorEnd,
    pvTvGordon,
    pvTvExit,
    evGordon,
    evExit,
    ev,
    tvShareOfEv: ev === 0 ? 0 : pvTvBlended / ev,
  };
}
