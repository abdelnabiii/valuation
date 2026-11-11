import { describe, expect, it } from "vitest";
import { PROFILES, isRelevant, runValuation } from "../src";
import { operatingExample, realEstateExample, startupExample } from "../fixtures/profile-examples";
import exp from "../fixtures/hand-expected-profiles.json";

const close = (a: number, b: number, tol = 0.01) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe("profiles registry", () => {
  it("every profile has methods with default weights that sum to 1", () => {
    for (const p of PROFILES) {
      const keys = p.methods.map((m) => `rec.w_${m === "income_cap" ? "income" : m}`);
      const total = keys.reduce((a, k) => a + (p.defaults[k] ?? 0), 0);
      expect(Math.abs(total - 1), p.key).toBeLessThan(1e-9);
    }
  });
  it("marks unit assumptions irrelevant outside multi-site profiles", () => {
    expect(isRelevant("unit.ramp_y1", "operating", ["dcf"])).toBe(false);
    expect(isRelevant("dcf.base.growth_y1", "operating", ["dcf"])).toBe(true);
    expect(isRelevant("vc.target_return", "early_stage", ["vc"])).toBe(true);
    expect(isRelevant("macro.us_rf", "early_stage", ["vc"])).toBe(false);
  });
});

describe("operating company (manufacturing)", () => {
  const r = runValuation(operatingExample());

  it("derives real growth from the client's nominal plan (by hand)", () => {
    const g = r.assumptions.filter((a) => a.key.startsWith("dcf.base.growth_y")).map((a) => a.value!);
    g.forEach((v, k) => close(v, exp.real[k]!, 1e-12));
    const up = r.assumptions.find((a) => a.key === "dcf.upside.growth_y1")!.value!;
    close(up, exp.real[0]! + 0.02, 1e-12);
  });

  it("forecasts revenue at the plan's nominal growth with no unit openings", () => {
    r.dcf.scenarios!.base.years.forEach((y, k) => {
      close(y.revenue, exp.rev[k]!);
      expect(y.newUnitsOpened).toBe(0);
    });
  });

  it("applies customer concentration and drops the delivery adjustment", () => {
    const keys = r.adjustments.rows.map((x) => x.key);
    expect(keys).toContain("adj.concentration");
    expect(keys).not.toContain("adj.delivery");
    close(r.adjustments.rows.find((x) => x.key === "adj.concentration")!.pct, 0.05, 1e-12);
  });

  it("uses manufacturing defaults and hides unit assumptions from open items", () => {
    expect(r.profile.model).toBe("operating");
    close(r.assumptions.find((a) => a.key === "dcf.nwc_pct")!.value!, 0.2, 1e-12);
    expect(r.openItems.some((o) => o.key.includes("unit.ramp"))).toBe(false);
    expect(r.sensitivities.map((s) => s.key)).toEqual(["rate_growth", "margin_sss", "exit_capex"]);
    close(r.sensitivities[2]!.values[2]![2]!, r.dcf.scenarios!.base.ev);
  });
});

describe("real estate (asset-heavy)", () => {
  const i = realEstateExample();
  const r = runValuation(i);

  it("computes NAV and income capitalisation (by hand)", () => {
    expect(r.nav.totalMarketValue).toBe(exp.nav);
    close(r.nav.incomeCap.low, exp.ic.low);
    close(r.nav.incomeCap.mid, exp.ic.mid);
    close(r.nav.incomeCap.high, exp.ic.high);
  });

  it("weights NAV 50%, income 30%, DCF 20%", () => {
    const w = Object.fromEntries(r.reconciliation.methods.map((m) => [m.method, m.weight]));
    close(w.nav!, 0.5, 1e-12);
    close(w.income_cap!, 0.3, 1e-12);
    close(w.dcf!, 0.2, 1e-12);
    const mid = 0.5 * exp.nav + 0.3 * exp.ic.mid + 0.2 * r.dcf.weightedEv;
    close(r.reconciliation.evMid, mid);
  });

  it("flags an asset without a market value", () => {
    const j = structuredClone(i);
    j.navAssets![1]!.marketValue = null;
    expect(runValuation(j).openItems.some((o) => o.key === "nav_missing:Retail units")).toBe(true);
  });
});

describe("early-stage startup", () => {
  const i = startupExample();
  const r = runValuation(i);

  it("computes the VC method from the comparables EV/Revenue range (by hand)", () => {
    close(r.earlyStage.vc.low, exp.vc.low);
    close(r.earlyStage.vc.mid, exp.vc.mid);
    close(r.earlyStage.vc.high, exp.vc.high);
  });

  it("computes scorecard and funding-round values (by hand)", () => {
    close(r.earlyStage.scorecard.value, exp.score);
    close(r.earlyStage.round.value, exp.round);
  });

  it("reconciles equity methods without the net-debt bridge distorting them", () => {
    const [lo, mid, hi] = exp.startupEquity as [number, number, number];
    close(r.reconciliation.equityLow, lo);
    close(r.reconciliation.equityMid, mid);
    close(r.reconciliation.equityHigh, hi);
    expect(r.reconciliation.youngCompany).toBe(true);
    expect(r.reconciliation.methods.find((m) => m.method === "dcf")!.weight).toBe(0);
  });

  it("does not demand DCF macro inputs for a startup", () => {
    const j = structuredClone(i);
    delete j.assumptions["macro.crp_egypt"];
    const res = runValuation(j);
    expect(res.openItems.some((o) => o.key === "missing:macro.crp_egypt")).toBe(false);
    expect(res.openItems.some((o) => o.key === "method:dcf")).toBe(false);
  });

  it("produces the VC sensitivity grid centred on the mid value", () => {
    expect(r.sensitivities).toHaveLength(1);
    close(r.sensitivities[0]!.values[2]![2]!, exp.vc.mid);
  });
});
