/**
 * Pure SVG chart generators used by the report (Word / PDF) and the deck,
 * plus an SVG -> PNG rasteriser (resvg).
 *
 * Every number drawn comes from the EngineResult passed in. No I/O except
 * font discovery inside svgToPng.
 */
import { Resvg } from "@resvg/resvg-js";
import type { EngineResult, SensitivityGrid } from "@valuation/engine";

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

export interface ChartPalette {
  primary: string;
  accent: string;
  neutral: string;
  /** Font-family stack written into the SVG. */
  fontFamily: string;
}

export interface BrandingLike {
  primaryColor: string;
  accentColor: string;
  neutralColor: string;
  typeface: string;
}

/**
 * Font stack for charts. Arial / Liberation Sans first after the brand face
 * so that rasterised charts match the Office fallback (Arial) and the PDF
 * face (Helvetica, metric-compatible).
 */
export function chartFontStack(typeface: string | null | undefined): string {
  const stack = [typeface, "Arial", "Liberation Sans", "Helvetica", "Inter", "DejaVu Sans", "sans-serif"]
    .filter((f): f is string => !!f && f.trim().length > 0)
    .map((f) => (f === "sans-serif" ? f : `'${f.replace(/'/g, "")}'`));
  return Array.from(new Set(stack)).join(", ");
}

export function paletteFromBranding(b: BrandingLike): ChartPalette {
  return {
    primary: normHex(b.primaryColor, "#1F2A44"),
    accent: normHex(b.accentColor, "#8C6D3F"),
    neutral: normHex(b.neutralColor, "#5B6472"),
    fontFamily: chartFontStack(b.typeface),
  };
}

export function normHex(c: string | null | undefined, fallback: string): string {
  const s = (c ?? "").trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(s)) return (s.startsWith("#") ? s : `#${s}`).toUpperCase();
  if (/^#?[0-9a-fA-F]{3}$/.test(s)) {
    const h = s.replace("#", "");
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase();
  }
  return fallback;
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Mix colour a towards b by t (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const k = Math.max(0, Math.min(1, t));
  const c = (x: number, y: number) => Math.round(x + (y - x) * k).toString(16).padStart(2, "0");
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`.toUpperCase();
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const m1 = (v: number) => (v / 1_000_000).toFixed(1);

export interface SvgChart {
  svg: string;
  width: number;
  height: number;
}

/* ------------------------------------------------------------------ */
/* Football field                                                      */
/* ------------------------------------------------------------------ */

function niceStep(range: number, target: number): number {
  const raw = range / Math.max(1, target);
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  const f = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return f * p;
}

/**
 * Horizontal bars per valuation method (EV basis), a marker for the asset
 * floor, the weighted EV range, and the concluded equity range (after the
 * equity bridge and value adjustments, rounded). Values in EGP millions.
 */
export function footballFieldSvg(result: EngineResult, palette: ChartPalette, opts: { width?: number } = {}): SvgChart {
  const rec = result.reconciliation;
  const W = opts.width ?? 900;
  const labelW = 280;
  const rightPad = 40;
  const top = 24;
  const rowH = 52;
  const plotX0 = labelW;
  const plotX1 = W - rightPad;

  type Row = { label: string; sub: string; kind: "bar" | "marker" | "final"; low: number; mid: number; high: number; dim?: boolean };
  const rows: Row[] = [];
  for (const m of rec.methods) {
    const w = `weight ${(m.weight * 100).toFixed(1)}%`;
    const basis = m.basis === "equity" ? "Equity value as EV equivalent" : "Enterprise value";
    const label = m.label.replace(/\s*\([^)]*\)\s*$/, "");
    if (!m.available) {
      rows.push({ label, sub: "Not computed", kind: "bar", low: 0, mid: 0, high: 0, dim: true });
    } else if (m.method === "asset" || m.low === m.high) {
      // single-point methods (asset floor, NAV, scorecard, funding round) are drawn as a marker
      rows.push({ label, sub: `${basis}, ${w}`, kind: "marker", low: m.low, mid: m.mid, high: m.high });
    } else {
      rows.push({ label, sub: `${basis}, ${w}`, kind: "bar", low: m.low, mid: m.mid, high: m.high });
    }
  }
  rows.push({ label: "Weighted enterprise value", sub: rec.floorApplied ? "After asset floor" : "Weighted by method", kind: "bar", low: rec.evLow, mid: rec.evMid, high: rec.evHigh });
  rows.push({ label: "Concluded equity value", sub: "After bridge and adjustments, rounded", kind: "final", low: rec.roundedLow, mid: rec.roundedMid, high: rec.roundedHigh });

  const vals = rows.filter((r) => !r.dim).flatMap((r) => [r.low, r.mid, r.high]);
  const maxV = Math.max(1, ...vals);
  const minV = Math.min(0, ...vals);
  const step = niceStep(maxV - minV, 6);
  const axMin = Math.floor(minV / step) * step;
  const axMax = Math.ceil((maxV * 1.04) / step) * step;
  const x = (v: number) => plotX0 + ((v - axMin) / (axMax - axMin)) * (plotX1 - plotX0);

  const plotBottom = top + rows.length * rowH;
  const H = plotBottom + 46;
  const grid = mix(palette.neutral, "#FFFFFF", 0.82);
  const text = mix(palette.primary, "#000000", 0.1);
  const sub = palette.neutral;
  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>`);

  // final band: subtle background on the concluded row
  const fi = rows.length - 1;
  parts.push(`<rect x="0" y="${top + fi * rowH}" width="${W}" height="${rowH}" fill="${mix(palette.accent, "#FFFFFF", 0.9)}"/>`);
  // separator above weighted rows
  const sepY = top + (rows.length - 2) * rowH;
  parts.push(`<line x1="0" y1="${sepY}" x2="${W}" y2="${sepY}" stroke="${mix(palette.neutral, "#FFFFFF", 0.55)}" stroke-width="1"/>`);

  // gridlines + ticks
  for (let v = axMin; v <= axMax + step / 2; v += step) {
    const gx = x(v);
    parts.push(`<line x1="${gx.toFixed(1)}" y1="${top}" x2="${gx.toFixed(1)}" y2="${plotBottom}" stroke="${grid}" stroke-width="1"/>`);
    parts.push(`<text x="${gx.toFixed(1)}" y="${plotBottom + 20}" font-size="12" fill="${sub}" text-anchor="middle">${esc(trimNum(v / 1_000_000))}</text>`);
  }
  parts.push(`<text x="${(plotX0 + plotX1) / 2}" y="${plotBottom + 40}" font-size="12" fill="${sub}" text-anchor="middle">EGP millions</text>`);

  rows.forEach((r, i) => {
    const cy = top + i * rowH + rowH / 2;
    const weight = r.kind === "final" ? 700 : 600;
    parts.push(`<text x="12" y="${cy - 3}" font-size="14" font-weight="${weight}" fill="${text}">${esc(r.label)}</text>`);
    parts.push(`<text x="12" y="${cy + 14}" font-size="11.5" fill="${sub}">${esc(r.sub)}</text>`);
    if (r.dim) {
      parts.push(`<text x="${plotX0 + 8}" y="${cy + 5}" font-size="12" fill="${sub}">n/a</text>`);
      return;
    }
    if (r.kind === "marker") {
      const mx = x(r.mid);
      parts.push(`<path d="M ${mx.toFixed(1)} ${cy - 9} L ${(mx + 9).toFixed(1)} ${cy} L ${mx.toFixed(1)} ${cy + 9} L ${(mx - 9).toFixed(1)} ${cy} Z" fill="${palette.neutral}"/>`);
      parts.push(`<text x="${(mx + 14).toFixed(1)}" y="${cy + 4.5}" font-size="12.5" fill="${text}">${m1(r.mid)}</text>`);
      return;
    }
    const color = r.kind === "final" ? palette.accent : i === rows.length - 2 ? palette.primary : mix(palette.primary, "#FFFFFF", 0.35);
    const bh = r.kind === "final" ? 22 : 18;
    const x0 = x(Math.min(r.low, r.high));
    const x1 = x(Math.max(r.low, r.high));
    const bw = Math.max(2, x1 - x0);
    parts.push(`<rect x="${x0.toFixed(1)}" y="${(cy - bh / 2).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh}" fill="${color}"/>`);
    const mx = x(r.mid);
    parts.push(`<line x1="${mx.toFixed(1)}" y1="${(cy - bh / 2 - 4).toFixed(1)}" x2="${mx.toFixed(1)}" y2="${(cy + bh / 2 + 4).toFixed(1)}" stroke="${text}" stroke-width="2"/>`);
    // value labels
    const lowLabel = m1(r.low);
    const highLabel = m1(r.high);
    const lx = x0 - 6;
    if (lx - lowLabel.length * 7 > plotX0 - 4) {
      parts.push(`<text x="${lx.toFixed(1)}" y="${cy + 4.5}" font-size="12.5" fill="${text}" text-anchor="end">${lowLabel}</text>`);
    } else {
      parts.push(`<text x="${(x0 + 4).toFixed(1)}" y="${(cy - bh / 2 - 6).toFixed(1)}" font-size="12" fill="${text}">${lowLabel}</text>`);
    }
    parts.push(`<text x="${(x1 + 6).toFixed(1)}" y="${cy + 4.5}" font-size="12.5" fill="${text}">${highLabel}</text>`);
    parts.push(`<text x="${mx.toFixed(1)}" y="${(cy + bh / 2 + 15).toFixed(1)}" font-size="11" fill="${sub}" text-anchor="middle">mid ${m1(r.mid)}</text>`);
  });

  const svg = wrapSvg(W, H, palette, parts.join(""));
  return { svg, width: W, height: H };
}

function trimNum(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1);
}

/* ------------------------------------------------------------------ */
/* Sensitivity heatmap                                                 */
/* ------------------------------------------------------------------ */

/** Formats a sensitivity axis step as +/- percentage points, % change or units. */
export function sensitivityAxisLabel(gridKey: string, axis: "row" | "col", v: number): string {
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  const a = Math.abs(v);
  const pctChange = () => (v === 0 ? "Base" : `${sign}${(a * 100).toFixed(0)}%`);
  if (gridKey === "units_capex") {
    if (axis === "row") return v === 0 ? "Plan" : `${sign}${a} unit${a === 1 ? "" : "s"}`;
    return pctChange();
  }
  if (gridKey === "exit_capex" && axis === "row") return v === 0 ? "Base" : `${sign}${trimNum(a)}x`;
  if ((gridKey === "cap_noi" || gridKey === "vc_return_multiple") && axis === "col") return pctChange();
  return v === 0 ? "Base" : `${sign}${(a * 100).toFixed(1)} pp`;
}

/** What the heatmap cells measure, for the chart footnote. */
export function sensitivityValueLabel(gridKey: string): string {
  if (gridKey === "vc_return_multiple") return "Venture capital method equity value";
  if (gridKey === "cap_noi") return "Income-capitalisation value";
  return "Base-scenario DCF enterprise value";
}

export function heatmapSvg(grid: SensitivityGrid, palette: ChartPalette, opts: { width?: number } = {}): SvgChart {
  const W = opts.width ?? 900;
  const nR = grid.rows.length;
  const nC = grid.cols.length;
  const rowHeadW = 170;
  const axisW = 34;
  const topTitle = 30;
  const colHeadH = 34;
  const cellH = 44;
  const x0 = axisW + rowHeadW;
  const cellW = (W - x0 - 10) / Math.max(1, nC);
  const y0 = topTitle + colHeadH;
  const H = y0 + nR * cellH + 34;
  const text = mix(palette.primary, "#000000", 0.1);
  const sub = palette.neutral;
  const parts: string[] = [`<rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>`];

  if (!grid.values.length) {
    parts.push(`<text x="${W / 2}" y="${H / 2}" font-size="14" fill="${sub}" text-anchor="middle">Sensitivity not available (method not computed)</text>`);
    return { svg: wrapSvg(W, H, palette, parts.join("")), width: W, height: H };
  }

  const flat = grid.values.flat();
  const lo = Math.min(...flat);
  const hi = Math.max(...flat);
  const baseR = grid.rows.indexOf(0);
  const baseC = grid.cols.indexOf(0);
  const light = mix(palette.primary, "#FFFFFF", 0.9);
  const dark = palette.primary;

  // column axis title
  parts.push(`<text x="${x0 + (cellW * nC) / 2}" y="${topTitle - 10}" font-size="13" font-weight="600" fill="${text}" text-anchor="middle">${esc(grid.colLabel)}</text>`);
  // row axis title (rotated)
  const ry = y0 + (nR * cellH) / 2;
  parts.push(`<text x="${axisW - 12}" y="${ry}" font-size="13" font-weight="600" fill="${text}" text-anchor="middle" transform="rotate(-90 ${axisW - 12} ${ry})">${esc(grid.rowLabel)}</text>`);

  grid.cols.forEach((c, j) => {
    const cx = x0 + j * cellW + cellW / 2;
    parts.push(`<text x="${cx.toFixed(1)}" y="${y0 - 12}" font-size="12.5" fill="${j === baseC ? text : sub}" font-weight="${j === baseC ? 700 : 400}" text-anchor="middle">${esc(sensitivityAxisLabel(grid.key, "col", c))}</text>`);
  });
  grid.rows.forEach((r, i) => {
    const cy = y0 + i * cellH + cellH / 2;
    parts.push(`<text x="${x0 - 12}" y="${cy + 4.5}" font-size="12.5" fill="${i === baseR ? text : sub}" font-weight="${i === baseR ? 700 : 400}" text-anchor="end">${esc(sensitivityAxisLabel(grid.key, "row", r))}</text>`);
    grid.cols.forEach((_, j) => {
      const v = grid.values[i]?.[j] ?? 0;
      const t = hi > lo ? (v - lo) / (hi - lo) : 0.5;
      const fill = mix(light, dark, 0.08 + t * 0.8);
      const fg = luminance(fill) < 0.3 ? "#FFFFFF" : text;
      const cx = x0 + j * cellW;
      const cyTop = y0 + i * cellH;
      parts.push(`<rect x="${cx.toFixed(1)}" y="${cyTop}" width="${cellW.toFixed(1)}" height="${cellH}" fill="${fill}" stroke="#FFFFFF" stroke-width="2"/>`);
      const isBase = i === baseR && j === baseC;
      parts.push(`<text x="${(cx + cellW / 2).toFixed(1)}" y="${cyTop + cellH / 2 + 5}" font-size="14" font-weight="${isBase ? 700 : 400}" fill="${fg}" text-anchor="middle">${m1(v)}</text>`);
    });
  });
  if (baseR >= 0 && baseC >= 0) {
    parts.push(`<rect x="${(x0 + baseC * cellW + 1.5).toFixed(1)}" y="${y0 + baseR * cellH + 1.5}" width="${(cellW - 3).toFixed(1)}" height="${cellH - 3}" fill="none" stroke="${palette.accent}" stroke-width="3"/>`);
  }
  parts.push(`<text x="${x0}" y="${H - 10}" font-size="11.5" fill="${sub}">${esc(sensitivityValueLabel(grid.key))}, EGP millions. Outlined cell = base case.</text>`);
  return { svg: wrapSvg(W, H, palette, parts.join("")), width: W, height: H };
}

function wrapSvg(W: number, H: number, palette: ChartPalette, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${esc(palette.fontFamily)}">${body}</svg>`;
}

/* ------------------------------------------------------------------ */
/* Rasterisation                                                       */
/* ------------------------------------------------------------------ */

export interface SvgToPngOptions {
  /** Extra font files (TTF/OTF). Needed where the host has no system fonts (e.g. serverless). */
  fontFiles?: string[];
  fontDirs?: string[];
  defaultFontFamily?: string;
}

function envList(name: string): string[] {
  const v = typeof process !== "undefined" ? process.env?.[name] : undefined;
  return v ? v.split(/[,:;]/).map((s) => s.trim()).filter(Boolean) : [];
}

/**
 * Rasterise an SVG to PNG at the given pixel width. System fonts are loaded;
 * additional fonts can be supplied via options or the env vars
 * VALUATION_CHART_FONT_FILES / VALUATION_CHART_FONT_DIRS (comma separated).
 */
export function svgToPng(svg: string, widthPx: number, opts: SvgToPngOptions = {}): Uint8Array {
  const family = opts.defaultFontFamily ?? "Liberation Sans";
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: Math.max(1, Math.round(widthPx)) },
    background: "#FFFFFF",
    font: {
      loadSystemFonts: true,
      fontFiles: [...(opts.fontFiles ?? []), ...envList("VALUATION_CHART_FONT_FILES")],
      fontDirs: [...(opts.fontDirs ?? []), ...envList("VALUATION_CHART_FONT_DIRS")],
      defaultFontFamily: family,
      sansSerifFamily: family,
    },
    shapeRendering: 2,
    textRendering: 1,
  });
  return new Uint8Array(r.render().asPng());
}
