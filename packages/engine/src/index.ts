import { Ctx } from "./context";
import {
  adjustments,
  assetFloor,
  bridge,
  compsMedian,
  dcf,
  discountRate,
  forecastParams,
  multiples,
  normalize,
  openItems,
  reconcile,
  sensitivities,
  unitEconomics,
} from "./steps";
import type { EngineInput, EngineResult } from "./types";

export const ENGINE_VERSION = "1.0.0";

export function runValuation(input: EngineInput): EngineResult {
  const ctx = new Ctx(input);
  const normalization = normalize(ctx);
  const ue = unitEconomics(ctx);
  const dr = discountRate(ctx);
  const medEbitda = compsMedian(ctx, "evToEbitda");
  const dcfResult = dcf(ctx, normalization, ue, dr, medEbitda);
  const mult = multiples(ctx, normalization);
  const asset = assetFloor(ctx);
  const adj = adjustments(ctx, normalization);
  const br = bridge(ctx);
  const rec = reconcile(ctx, dcfResult, mult, asset, br, adj);
  const sens = sensitivities(
    dcfResult.available ? forecastParams(ctx, "base", normalization, ue, dr, ctx.n("dcf.exit_multiple")) : null,
  );
  const resolved = ctx.finalize();
  const items = openItems(ctx, resolved, { dcf: dcfResult, multiples: mult, dr });
  const provisional = items.some((i) => i.severity === "blocking" && !i.waived);

  return {
    engineVersion: ENGINE_VERSION,
    assumptions: resolved,
    normalization,
    unitEconomics: ue,
    discountRate: dr,
    dcf: dcfResult,
    multiples: mult,
    assetFloor: asset,
    adjustments: adj,
    bridge: br,
    reconciliation: rec,
    sensitivities: sens,
    openItems: items,
    provisional,
  };
}

export * from "./types";
export * from "./catalogue";
export { runForecast, type ForecastParams } from "./forecast";
export { percentileInc, roundTo, xlRound, monthsBetween, daysBetween } from "./math";
export {
  SENS_CAPEX,
  SENS_GROWTH,
  SENS_MARGIN,
  SENS_RATE,
  SENS_SSS,
  SENS_UNITS,
  suggestDelivery,
  suggestFx,
  suggestKeyPerson,
  suggestLeaseRisk,
} from "./steps";
