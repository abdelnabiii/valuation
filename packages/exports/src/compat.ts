import { CATALOGUE, getProfile, isRelevant, METHOD_LABELS, type EngineResult, type MethodKey } from "@valuation/engine";

/**
 * Brings a result saved by an older engine version up to the current shape so
 * every export works for runs saved before an upgrade. Nothing is recalculated:
 * fields that did not exist are filled as "not applicable/missing".
 */
export function normalizeResult(r: EngineResult, profileKey?: string | null): EngineResult {
  const p = getProfile(r.profile?.key ?? profileKey);
  const out: EngineResult = { ...r };
  out.profile = r.profile ?? { key: p.key, label: p.label, family: p.family, model: p.model, methods: p.methods };
  const have = new Map(r.assumptions.map((a) => [a.key, a]));
  out.assumptions = CATALOGUE.map(
    (c) =>
      have.get(c.key) ?? {
        key: c.key,
        label: c.label,
        unit: c.unit,
        category: c.kind,
        section: c.section,
        value: null,
        origin: "missing" as const,
        confirmed: false,
        sourceId: null,
        asOf: null,
        stale: false,
        requiresSource: c.kind === "market",
        relevant: false,
      },
  ).map((a) => (a.relevant === undefined ? { ...a, relevant: isRelevant(a.key, out.profile.model, out.profile.methods) } : a));
  out.reconciliation = {
    ...r.reconciliation,
    methods: r.reconciliation.methods.map((m) => ({
      ...m,
      label: m.label ?? METHOD_LABELS[m.method as MethodKey],
      basis: m.basis ?? "ev",
      nativeLow: m.nativeLow ?? m.low,
      nativeMid: m.nativeMid ?? m.mid,
      nativeHigh: m.nativeHigh ?? m.high,
    })),
  };
  out.nav = r.nav ?? { available: false, rows: [], totalMarketValue: 0, missing: [], incomeCap: { available: false, noi: 0, capRate: null, spread: 0, low: 0, mid: 0, high: 0 } };
  out.earlyStage = r.earlyStage ?? {
    vc: { available: false, exitRevenue: 0, exitYears: 0, exitMultipleLow: null, exitMultiple: null, exitMultipleHigh: null, targetReturn: 0, retention: 0, exitValue: 0, discountFactor: 0, low: 0, mid: 0, high: 0 },
    scorecard: { available: false, base: null, factors: [], multiplier: 0, value: 0 },
    round: { available: false, postMoney: null, date: null, adjustment: 0, value: 0 },
  };
  return out;
}
