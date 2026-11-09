import { describe, expect, it } from "vitest";
import { runValuation, type EngineInput } from "../src";
import { handExample } from "../fixtures/hand-example";
import expected from "../fixtures/hand-expected.json";

const CENT = 0.01;
const close = (a: number, b: number, tol = CENT) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const r = runValuation(handExample);

describe("hand-calculated reference case", () => {
  it("normalizes earnings (exact, by hand)", () => {
    expect(r.normalization.revenue).toBe(16_000_000);
    expect(r.normalization.reportedEbitda).toBe(2_500_000);
    expect(r.normalization.totalAddbacks).toBe(1_200_000);
    expect(r.normalization.sde).toBe(3_700_000);
    expect(r.normalization.normalizedEbitda).toBe(3_100_000);
    close(r.normalization.normalizedMargin, 0.19375, 1e-12);
  });

  it("computes unit economics (exact, by hand)", () => {
    const [a, b] = r.unitEconomics.rows;
    expect(a!.fourWallEbitda).toBe(2_500_000);
    close(a!.fourWallMargin, 0.25, 1e-12);
    close(a!.primeCostPct, 0.5, 1e-12);
    close(a!.rentPct, 0.1, 1e-12);
    close(a!.paybackYears!, 1.6, 1e-12);
    expect(a!.mature).toBe(true);
    expect(b!.fourWallEbitda).toBe(1_200_000);
    close(b!.paybackYears!, 4_000_000 / 1_200_000, 1e-12);
    expect(b!.mature).toBe(false);
    expect(b!.monthsOpen).toBe(17);
  });

  it("builds the discount rate", () => {
    close(r.discountRate!.costOfEquityUsd, 0.22, 1e-12);
    r.discountRate!.waccEgp.forEach((w, i) => close(w, expected.waccEgp[i]!, 1e-12));
    close(r.discountRate!.waccEgpTerminal, expected.waccEgpTerminal, 1e-12);
    close(r.discountRate!.waccUsd, 0.22, 1e-12);
  });

  it("forecasts year 1 of the base case (by hand)", () => {
    const y1 = r.dcf.scenarios!.base.years[0]!;
    close(y1.existingRevenue, 18_768_000);
    close(y1.newUnitRevenue, 6_900_000);
    close(y1.revenue, 25_668_000);
    close(y1.ebitda, 4_973_175);
    close(y1.tax, 887_952.375);
    close(y1.capex, 4_600_000 + 770_040);
    close(y1.fcff, -1_284_817.375);
  });

  it("matches the independent recalculation to the cent", () => {
    const b = r.dcf.scenarios!.base;
    b.years.forEach((y, i) => {
      close(y.revenue, expected.base.revenue[i]!);
      close(y.fcff, expected.base.fcff[i]!);
    });
    close(b.sumPv, expected.base.sumPv);
    close(b.tvGordon, expected.base.tvGordon);
    close(b.tvExit, expected.base.tvExit);
    close(b.ev, expected.base.ev);
    close(r.dcf.scenarios!.upside.ev, expected.upsideEv);
    close(r.dcf.scenarios!.downside.ev, expected.downsideEv);
    close(r.dcf.weightedEv, expected.dcfWeighted);
  });

  it("applies multiples with QUARTILE.INC", () => {
    const e = r.multiples.stats.find((s) => s.metric === "ev_ebitda")!;
    expect([e.q1, e.median, e.q3]).toEqual([6, 7, 8]);
    close(r.multiples.low, expected.multiples.low);
    close(r.multiples.mid, expected.multiples.mid);
    close(r.multiples.high, expected.multiples.high);
  });

  it("computes the asset floor, bridge and adjustments", () => {
    close(r.assetFloor.floor, 1_440_000);
    close(r.bridge.netAdjustment, -1_700_000);
    close(r.adjustments.combinedFactor, expected.adjFactor, 1e-12);
  });

  it("reconciles to a range", () => {
    const c = r.reconciliation;
    close(c.evLow, expected.evLow);
    close(c.evMid, expected.evMid);
    close(c.evHigh, expected.evHigh);
    close(c.adjustedLow, expected.adjusted[0]!);
    close(c.adjustedMid, expected.adjusted[1]!);
    close(c.adjustedHigh, expected.adjusted[2]!);
    expect([c.roundedLow, c.roundedMid, c.roundedHigh]).toEqual(expected.rounded);
    expect(c.youngCompany).toBe(false);
    expect(c.roundedLow).toBeLessThan(c.roundedMid);
    expect(c.roundedMid).toBeLessThan(c.roundedHigh);
  });

  it("produces 5x5 sensitivity grids whose centre equals the base EV", () => {
    expect(r.sensitivities).toHaveLength(3);
    for (const g of r.sensitivities) {
      expect(g.values).toHaveLength(5);
      close(g.values[2]![2]!, r.dcf.scenarios!.base.ev);
    }
    const rg = r.sensitivities[0]!;
    expect(rg.values[0]![2]!).toBeGreaterThan(rg.values[4]![2]!); // lower rate -> higher value
  });

  it("USD cross-check under PPP is close to the EGP DCF", () => {
    const x = r.dcf.usdCrossCheck!;
    expect(x.fxBasis).toBe("ppp");
    expect(Math.abs(x.differencePct)).toBeLessThan(0.1);
  });

  it("is final when every input is confirmed and sourced", () => {
    const blocking = r.openItems.filter((i) => i.severity === "blocking");
    expect(blocking).toEqual([]);
    expect(r.provisional).toBe(false);
  });
});

describe("quality rules", () => {
  const clone = (): EngineInput => structuredClone(handExample);

  it("never invents a multiple: no comparables -> multiples unavailable and provisional", () => {
    const i = clone();
    i.comparables = [];
    delete i.assumptions["dcf.exit_multiple"];
    const res = runValuation(i);
    expect(res.multiples.available).toBe(false);
    expect(res.dcf.available).toBe(false);
    expect(res.provisional).toBe(true);
    expect(res.openItems.map((o) => o.key)).toContain("method:multiples");
  });

  it("missing macro input blocks DCF and is listed", () => {
    const i = clone();
    delete i.assumptions["macro.crp_egypt"];
    const res = runValuation(i);
    expect(res.dcf.available).toBe(false);
    expect(res.openItems.map((o) => o.key)).toContain("missing:macro.crp_egypt");
  });

  it("flags macro data older than 30 days", () => {
    const i = clone();
    i.meta.asOfToday = "2026-02-15";
    const res = runValuation(i);
    expect(res.openItems.some((o) => o.key === "stale:macro.us_rf")).toBe(true);
    expect(res.provisional).toBe(true);
  });

  it("flags market data without a source", () => {
    const i = clone();
    i.assumptions["macro.erp"] = { value: 0.045, confirmed: true, sourceId: null, asOf: "2025-12-15" };
    const res = runValuation(i);
    expect(res.openItems.some((o) => o.key === "source:macro.erp")).toBe(true);
  });

  it("unconfirmed system defaults keep the valuation provisional", () => {
    const i = clone();
    delete i.assumptions["adj.dlom"];
    const res = runValuation(i);
    expect(res.openItems.some((o) => o.key === "confirm:adj.dlom")).toBe(true);
    expect(res.provisional).toBe(true);
  });

  it("waived items no longer make the run provisional", () => {
    const i = clone();
    delete i.assumptions["adj.dlom"];
    i.meta.waivedOpenItems = ["confirm:adj.dlom"];
    expect(runValuation(i).provisional).toBe(false);
  });

  it("young company (<36 months) weights DCF above multiples by default", () => {
    const i = clone();
    i.meta.monthsOfHistory = 20;
    delete i.assumptions["rec.w_dcf"];
    delete i.assumptions["rec.w_multiples"];
    const res = runValuation(i);
    const d = res.reconciliation.methods.find((m) => m.method === "dcf")!;
    const m = res.reconciliation.methods.find((m) => m.method === "multiples")!;
    expect(res.reconciliation.youngCompany).toBe(true);
    expect(d.weight).toBeGreaterThan(m.weight);
  });

  it("EGP T-bill method warns about double counting country risk", () => {
    const i = clone();
    i.meta.discountRateMethod = "egp_tbill";
    const res = runValuation(i);
    expect(res.discountRate!.warnings.length).toBe(1);
    close(res.discountRate!.waccEgp[0]!, 0.25 + 0.045 + 0.07 + 0.03 + 0.03, 1e-12);
  });

  it("derives adjustment suggestions from intake data", () => {
    const i = clone();
    delete i.assumptions["adj.key_person"];
    delete i.assumptions["adj.delivery"];
    const res = runValuation(i);
    const kp = res.adjustments.rows.find((r) => r.key === "adj.key_person")!;
    const dl = res.adjustments.rows.find((r) => r.key === "adj.delivery")!;
    close(kp.pct, 0.05, 1e-12); // score 3 -> 5%
    close(dl.pct, 0.025, 1e-12); // delivery 31.25% -> 2.5%
  });

  it("asset floor lifts the range when methods fall below it", () => {
    const i = clone();
    i.assumptions["rec.w_dcf"] = { value: 0, confirmed: true };
    i.assumptions["rec.w_multiples"] = { value: 0, confirmed: true };
    i.assumptions["rec.w_asset"] = { value: 1, confirmed: true };
    const res = runValuation(i);
    close(res.reconciliation.evMid, 1_440_000);
  });
});
