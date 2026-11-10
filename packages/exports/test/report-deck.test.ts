import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { footballFieldSvg, heatmapSvg, paletteFromBranding, svgToPng } from "../src/charts";
import { renderDeck } from "../src/deck";
import { buildReportModel, fmtAmount, fmtMoney, renderReportDocx, renderReportPdf } from "../src/report";
import { sampleContext } from "../src/sample";

/** Set WRITE_PREVIEW=1 to write the rendered files to packages/exports/preview/. */
const PREVIEW = process.env.WRITE_PREVIEW === "1";
const previewDir = join(dirname(fileURLToPath(import.meta.url)), "..", "preview");
function preview(name: string, bytes: Uint8Array) {
  if (!PREVIEW) return;
  mkdirSync(previewDir, { recursive: true });
  writeFileSync(join(previewDir, name), bytes);
}

const ascii = (b: Uint8Array, n: number) => Buffer.from(b.slice(0, n)).toString("latin1");

async function zipText(bytes: Uint8Array, path: string): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const f = zip.file(path);
  if (!f) throw new Error(`missing ${path}`);
  // strip XML tags and join runs so phrases split across runs still match
  return (await f.async("string")).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
}

async function slidesText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  const parts = await Promise.all(names.map((n) => zip.file(n)!.async("string")));
  return parts.join(" ").replace(/<[^>]+>/g, " ");
}

describe("charts", () => {
  it("renders football field and heatmaps to PNG", () => {
    const ctx = sampleContext();
    const pal = paletteFromBranding(ctx.branding);
    const ff = footballFieldSvg(ctx.result, pal);
    expect(ff.svg.startsWith("<svg")).toBe(true);
    const png = svgToPng(ff.svg, 600);
    expect(ascii(png, 4)).toBe("\x89PNG");
    expect(ctx.result.sensitivities).toHaveLength(3);
    for (const g of ctx.result.sensitivities) {
      const h = heatmapSvg(g, pal);
      expect(h.svg).toContain((g.values[2]![2]! / 1e6).toFixed(1));
    }
  });
});

describe("report", () => {
  it("builds a model with sections in the required order", () => {
    const m = buildReportModel(sampleContext());
    expect(m.sections.map((s) => s.id)).toEqual([
      "summary",
      "business",
      "methodology",
      "financials",
      "methods",
      "reconciliation",
      "sensitivities",
      "risks",
      "recommendations",
      "assumptions",
      "open_items",
      "limitations",
      "disclaimer",
    ]);
  });

  it("renders docx with disclaimer, Open Items and the rounded mid value", async () => {
    const ctx = sampleContext();
    const bytes = await renderReportDocx(ctx);
    preview("report.docx", bytes);
    expect(bytes.length).toBeGreaterThan(10_000);
    expect(ascii(bytes, 2)).toBe("PK");
    const text = await zipText(bytes, "word/document.xml");
    expect(text).toContain(ctx.branding.disclaimerText);
    expect(text).toContain("not a certified valuation by a licensed valuer");
    expect(text).toContain("Open Items");
    expect(text).toContain("Basis of value");
    expect(text).toContain("willing and able buyer");
    expect(text).toContain("100% of the equity");
    expect(text).toContain(fmtMoney(ctx.result.reconciliation.roundedMid)); // "EGP 13.4m"
    expect(text).toContain(fmtAmount(ctx.result.reconciliation.roundedMid)); // "13,400,000"
    expect(text).not.toContain("PROVISIONAL");
  });

  it("renders pdf", async () => {
    const bytes = await renderReportPdf(sampleContext());
    preview("report.pdf", bytes);
    expect(bytes.length).toBeGreaterThan(10_000);
    expect(ascii(bytes, 4)).toBe("%PDF");
  });

  it("marks a provisional result as PROVISIONAL", async () => {
    const ctx = sampleContext();
    ctx.result.provisional = true;
    const docx = await renderReportDocx(ctx);
    preview("report-provisional.docx", docx);
    expect(ascii(docx, 2)).toBe("PK");
    const text = await zipText(docx, "word/document.xml");
    expect(text).toContain("PROVISIONAL");
    expect(text).toContain("Open Items");
    expect(text).toContain(fmtMoney(ctx.result.reconciliation.roundedMid));
    expect(text).toContain(ctx.branding.disclaimerText);

    const pdf = await renderReportPdf(ctx);
    preview("report-provisional.pdf", pdf);
    expect(ascii(pdf, 4)).toBe("%PDF");
  });

  it("lists unwaived open items when present", async () => {
    const ctx = sampleContext();
    ctx.result.openItems = [
      { key: "missing:macro.us_rf", category: "missing_input", severity: "blocking", message: "US 10-year Treasury yield: no value." },
      { key: "data:x", category: "data_quality", severity: "warning", message: "Waived thing.", waived: true },
    ];
    ctx.result.provisional = true;
    const text = await zipText(await renderReportDocx(ctx), "word/document.xml");
    expect(text).toContain("US 10-year Treasury yield: no value.");
    expect(text).toContain("Waived items");
  });
});

describe("deck", () => {
  it("renders a 9-slide pptx", async () => {
    const ctx = sampleContext();
    const bytes = await renderDeck(ctx);
    preview("deck.pptx", bytes);
    expect(bytes.length).toBeGreaterThan(10_000);
    expect(ascii(bytes, 2)).toBe("PK");
    const zip = await JSZip.loadAsync(bytes);
    const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    expect(slides).toHaveLength(9);
    const text = await slidesText(bytes);
    expect(text).toContain(fmtMoney(ctx.result.reconciliation.roundedMid));
    expect(text).not.toContain("PROVISIONAL");
  });

  it("stamps a provisional deck", async () => {
    const ctx = sampleContext();
    ctx.result.provisional = true;
    const bytes = await renderDeck(ctx);
    preview("deck-provisional.pptx", bytes);
    expect(await slidesText(bytes)).toContain("PROVISIONAL");
  });

  it("explains a minority basis without claiming a discount the model does not apply", async () => {
    const { basisOfValueBlocks } = await import("../src/report/basis");
    const ctx = sampleContext();
    ctx.engagement.basis = "minority";
    const text = JSON.stringify(basisOfValueBlocks(ctx));
    expect(text).toContain("does not apply a separate discount for lack of control");
    expect(text).toContain("Minority (basis)");
  });
});
