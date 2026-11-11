import { describe, expect, it } from "vitest";
import { buildWorkbook } from "../src/excel/workbook";
import { normalizeResult } from "../src/compat";
import { renderDeck, renderReportDocx } from "../src";
import { sampleContext } from "../src/sample";

/** A run saved by engine 1.x lacks profile, nav, earlyStage, new assumptions and method basis. */
function v1Context() {
  const ctx = sampleContext();
  const r: any = structuredClone(ctx.result);
  delete r.profile;
  delete r.nav;
  delete r.earlyStage;
  r.assumptions = r.assumptions.filter((a: any) => !/growth_y|^nav\.|^vc\.|^sc\.|^round\.|concentration|rec\.w_(nav|income|vc|scorecard|round)/.test(a.key)).map(({ relevant: _r, ...a }: any) => a);
  r.reconciliation.methods = r.reconciliation.methods.map(({ basis: _b, nativeLow: _l, nativeMid: _m, nativeHigh: _h, ...m }: any) => m);
  delete ctx.input.meta.profileKey;
  return { ...ctx, result: r };
}

describe("runs saved by an older engine still export", () => {
  it("normalizes and renders Excel, Word and the deck", async () => {
    const ctx = v1Context();
    const fixed = { ...ctx, result: normalizeResult(ctx.result, null) };
    expect(fixed.result.profile.key).toBe("fnb");
    expect((await buildWorkbook(fixed)).buffer.length).toBeGreaterThan(10_000);
    expect((await renderReportDocx(fixed)).length).toBeGreaterThan(10_000);
    expect((await renderDeck(fixed)).length).toBeGreaterThan(10_000);
  }, 120_000);
});
