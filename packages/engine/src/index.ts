import { Ctx } from "./context";
import {
  adjustments,
  assetFloor,
  bridge,
  compsMedian,
  dcf,
  discountRate,
  earlyStage,
  nav,
  forecastParams,
  multiples,
  normalize,
  openItems,
  reconcile,
  sensitivities,
  unitEconomics,
} from "./steps";
import type { EngineInput, EngineResult } from "./types";

export const ENGINE_VERSION = "2.0.0";

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
  const nv = nav(ctx, normalization);
  const es = earlyStage(ctx, mult);
  const rec = reconcile(ctx, dcfResult, mult, asset, br, adj, nv, es);
  const model = ctx.profile.model;
  const sens = sensitivities(
    model,
    dcfResult.available ? forecastParams(ctx, "base", normalization, ue, dr, ctx.n("dcf.exit_multiple")) : null,
    {
      incomeCap: nv.incomeCap.available ? { noi: nv.incomeCap.noi, capRate: nv.incomeCap.capRate! } : null,
      vc: es.vc.available ? { exitRevenue: es.vc.exitRevenue, exitMultiple: es.vc.exitMultiple!, retention: es.vc.retention, targetReturn: es.vc.targetReturn, years: es.vc.exitYears } : null,
    },
  );
  const resolved = ctx.finalize();
  const items = openItems(ctx, resolved, { dcf: dcfResult, multiples: mult, dr, rec, nav: nv, early: es });
  const provisional = items.some((i) => i.severity === "blocking" && !i.waived);

  return {
    engineVersion: ENGINE_VERSION,
    profile: { key: ctx.profile.key, label: ctx.profile.label, family: ctx.profile.family, model, methods: ctx.profile.methods },
    nav: nv,
    earlyStage: es,
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
export * from "./profiles";
export { runForecast, type ForecastParams } from "./forecast";
export { percentileInc, roundTo, xlRound, monthsBetween, daysBetween } from "./math";
export {
  SENS_CAPEX,
  SENS_GROWTH,
  SENS_MARGIN,
  SENS_RATE,
  SENS_SSS,
  SENS_UNITS,
  SENS_EXIT,
  SENS_CAPEX_PCT,
  SENS_CAP_RATE,
  SENS_NOI,
  SENS_VC_RETURN,
  SENS_VC_MULT,
  vcValue,
  suggestConcentration,
  suggestDelivery,
  suggestFx,
  suggestKeyPerson,
  suggestLeaseRisk,
} from "./steps";
