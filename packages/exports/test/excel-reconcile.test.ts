import { describe, expect, it } from "vitest";
import { buildWorkbook } from "../src/excel/workbook";
import { sampleContext } from "../src/sample";
import { recalc } from "./recalc";

function get(obj: unknown, path: string): number {
  return path.split(".").reduce<any>((o, k) => o?.[k], obj) as number;
}

describe("Excel export reconciles to the engine", () => {
  it("every checked cell equals the engine value to the cent", async () => {
    const ctx = sampleContext();
    const { buffer, map } = await buildWorkbook(ctx);
    const x = await recalc(buffer);
    const failures: string[] = [];
    let n = 0;
    for (const [path, ref] of Object.entries(map.checks)) {
      const engine = get(ctx.result, path);
      const excel = x.value(ref);
      n++;
      if (typeof excel !== "number" || Math.abs(excel - engine) > 0.01) failures.push(`${path} @ ${ref}: engine=${engine} excel=${String(excel)}`);
    }
    expect(n).toBeGreaterThan(100);
    expect(failures).toEqual([]);
  }, 240_000);

  it("contains no formula errors", async () => {
    const { buffer } = await buildWorkbook(sampleContext());
    const x = await recalc(buffer);
    const errors: string[] = [];
    x.wb.eachSheet((ws) =>
      ws.eachRow((row) =>
        row.eachCell((c) => {
          const v: any = c.value;
          const r = v && typeof v === "object" && "result" in v ? v.result : v;
          if (r && typeof r === "object" && "error" in r) errors.push(`${ws.name}!${c.address}: ${r.error}`);
        }),
      ),
    );
    expect(errors).toEqual([]);
  }, 240_000);
});
