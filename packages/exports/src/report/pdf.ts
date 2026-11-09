/** PDF renderer for the report model (pdfkit, no external binaries). */
import PDFDocument from "pdfkit";
import { mix, svgToPng } from "../charts";
import type { ExportContext } from "../context";
import { buildReportModel, type Block, type ReportModel, type RowStyle, type TableColumn } from "./model";

type Doc = PDFKit.PDFDocument;

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const ML = 66;
const MR = 66;
const MT = 70;
const MB = 74;
const CW = PAGE_W - ML - MR;
const LIMIT = PAGE_H - MB;

/* Helvetica is metric-compatible with Arial, the Office fallback face. */
const F = { regular: "Helvetica", bold: "Helvetica-Bold", italic: "Helvetica-Oblique" };

interface Theme {
  primary: string;
  accent: string;
  neutral: string;
  text: string;
  rule: string;
  hair: string;
  lightFill: string;
}

function theme(m: ReportModel): Theme {
  const p = m.palette;
  return {
    primary: p.primary,
    accent: p.accent,
    neutral: p.neutral,
    text: mix(p.primary, "#000000", 0.35),
    rule: mix(p.neutral, "#FFFFFF", 0.65),
    hair: "#E6E6E6",
    lightFill: mix(p.primary, "#FFFFFF", 0.93),
  };
}

const BODY = 9.5;
const LINE_GAP = 2.2;

class Layout {
  constructor(
    readonly doc: Doc,
    readonly t: Theme,
  ) {}

  get y() {
    return this.doc.y;
  }
  set y(v: number) {
    this.doc.y = v;
  }
  remaining() {
    return LIMIT - this.doc.y;
  }
  newPage() {
    this.doc.addPage();
    this.doc.x = ML;
    this.doc.y = MT;
  }
  ensure(h: number) {
    if (this.remaining() < h && this.y > MT + 1) this.newPage();
  }
  textHeight(text: string, font: string, size: number, width: number, lineGap = LINE_GAP) {
    this.doc.font(font).fontSize(size);
    return this.doc.heightOfString(text || " ", { width, lineGap });
  }
  write(text: string, opts: { font?: string; size?: number; color?: string; x?: number; width?: number; align?: "left" | "right" | "center"; gapAfter?: number; lineGap?: number }) {
    const { font = F.regular, size = BODY, color = this.t.text, x = ML, width = CW, align = "left", gapAfter = 0, lineGap = LINE_GAP } = opts;
    this.doc.font(font).fontSize(size).fillColor(color);
    this.doc.text(text, x, this.doc.y, { width, align, lineGap });
    this.doc.y += gapAfter;
  }
  /** Draw text at fixed position without moving the cursor. */
  at(text: string, x: number, y: number, width: number, font: string, size: number, color: string, align: "left" | "right" | "center" = "left") {
    const keep = this.doc.y;
    this.doc.font(font).fontSize(size).fillColor(color);
    this.doc.text(text, x, y, { width, align, lineGap: LINE_GAP });
    this.doc.y = keep;
  }
  hline(y: number, color: string, w = 0.5, x0 = ML, x1 = ML + CW) {
    this.doc.save().moveTo(x0, y).lineTo(x1, y).lineWidth(w).strokeColor(color).stroke().restore();
  }
}

/* ------------------------------------------------------------------ */
/* Block renderers                                                     */
/* ------------------------------------------------------------------ */

const HEADING = {
  1: { size: 16, gapBefore: 0, gapAfter: 10 },
  2: { size: 12.5, gapBefore: 14, gapAfter: 6 },
  3: { size: 10, gapBefore: 9, gapAfter: 4 },
} as const;

function headingHeight(L: Layout, level: 1 | 2 | 3, text: string) {
  const h = HEADING[level];
  return h.gapBefore + L.textHeight(text, F.bold, h.size, CW) + h.gapAfter;
}

function colWidths(cols: TableColumn[]): number[] {
  const s = cols.reduce((a, c) => a + c.width, 0);
  return cols.map((c) => (c.width / s) * CW);
}

const PADX = 4;
const PADY = 3.2;

function rowHeight(L: Layout, cells: string[], ws: number[], font: string, size: number) {
  return Math.max(...cells.map((c, i) => L.textHeight(c, font, size, ws[i]! - 2 * PADX, 1))) + 2 * PADY;
}

function tableMetrics(L: Layout, b: Extract<Block, { type: "table" }>) {
  const ws = colWidths(b.columns);
  const size = b.small ? 7.6 : 8.6;
  const hasHeader = b.columns.some((c) => c.header);
  const headerH = hasHeader ? rowHeight(L, b.columns.map((c) => c.header), ws, F.bold, size) + 1 : 0;
  const rowHs = b.rows.map((r) => rowHeight(L, r.cells, ws, r.style && r.style !== "normal" && r.style !== "muted" ? F.bold : F.regular, size));
  const noteH = b.note ? L.textHeight(b.note, F.italic, 7.5, CW) + 4 : 0;
  const total = headerH + rowHs.reduce((a, x) => a + x, 0) + noteH + 10;
  return { ws, size, hasHeader, headerH, rowHs, noteH, total };
}

function drawTable(L: Layout, b: Extract<Block, { type: "table" }>) {
  const t = L.t;
  const m = tableMetrics(L, b);
  if (b.caption) {
    L.ensure(L.textHeight(b.caption, F.bold, 9, CW) + m.headerH + (m.rowHs[0] ?? 0) * 2);
    L.write(b.caption, { font: F.bold, size: 9, gapAfter: 3 });
  }
  const usable = LIMIT - MT;
  // keep short tables together (mirrors keepNext on rows in Word)
  if (b.rows.length <= 16 && m.total <= usable && L.remaining() < m.total) L.newPage();
  else L.ensure(m.headerH + (m.rowHs[0] ?? 0) + (m.rowHs[1] ?? 0));

  const drawHeader = () => {
    if (!m.hasHeader) return;
    let x = ML;
    const y = L.y;
    b.columns.forEach((c, i) => {
      L.at(c.header, x + PADX, y + PADY, m.ws[i]! - 2 * PADX, F.bold, m.size, t.primary, c.align);
      x += m.ws[i]!;
    });
    L.y = y + m.headerH;
    L.hline(L.y - 0.5, t.primary, 0.8);
  };
  drawHeader();
  b.rows.forEach((r, ri) => {
    const h = m.rowHs[ri]!;
    const keepWith = r.style === "group" ? (m.rowHs[ri + 1] ?? 0) : 0;
    if (L.y + h + keepWith > LIMIT) {
      L.newPage();
      drawHeader();
    }
    const style: RowStyle = r.style ?? "normal";
    const bold = style === "total" || style === "subtotal" || style === "group";
    const color = style === "muted" ? t.neutral : style === "group" ? t.primary : t.text;
    const y = L.y;
    if (style === "total") {
      L.doc.save().rect(ML, y, CW, h).fill(t.lightFill).restore();
      L.hline(y, t.primary, 0.7);
    } else if (style === "subtotal") L.hline(y, t.rule, 0.5);
    let x = ML;
    r.cells.forEach((c, i) => {
      const font = bold ? F.bold : style === "muted" && i === 0 ? F.italic : F.regular;
      L.at(c, x + PADX, y + PADY, m.ws[i]! - 2 * PADX, font, m.size, color, b.columns[i]?.align ?? "left");
      x += m.ws[i]!;
    });
    L.y = y + h;
    L.hline(L.y, ri === b.rows.length - 1 ? t.rule : t.hair, ri === b.rows.length - 1 ? 0.6 : 0.4);
  });
  L.y += 4;
  if (b.note) L.write(b.note, { font: F.italic, size: 7.5, color: t.neutral, gapAfter: 2 });
  L.y += 8;
}

function drawKv(L: Layout, b: Extract<Block, { type: "kv" }>) {
  const t = L.t;
  const w0 = CW * 0.36;
  const w1 = CW - w0;
  const size = 9.2;
  const hs = b.items.map((it) => Math.max(L.textHeight(it.label, F.regular, size, w0 - 8, 1), L.textHeight(it.value, F.regular, size, w1 - 8, 1)) + 2 * PADY);
  const total = hs.reduce((a, x) => a + x, 0) + 8;
  if (b.items.length <= 14 && total <= LIMIT - MT && L.remaining() < total) L.newPage();
  b.items.forEach((it, i) => {
    const h = hs[i]!;
    if (L.y + h > LIMIT) L.newPage();
    const y = L.y;
    L.at(it.label, ML, y + PADY, w0 - 8, F.regular, size, t.neutral);
    L.at(it.value, ML + w0 + 4, y + PADY, w1 - 8, F.regular, size, t.text);
    L.y = y + h;
    L.hline(L.y, t.hair, 0.4);
  });
  L.y += 10;
}

function drawHighlight(L: Layout, b: Extract<Block, { type: "highlight" }>) {
  const t = L.t;
  const pad = 14;
  const iw = CW - 2 * pad - 4;
  const h =
    pad +
    L.textHeight(b.label, F.regular, 9, iw) +
    5 +
    L.textHeight(b.value, F.bold, 17, iw) +
    6 +
    b.lines.reduce((a, l) => a + L.textHeight(l, F.regular, 9, iw) + 2, 0) +
    pad;
  L.ensure(h + 12);
  const y = L.y;
  L.doc.save().rect(ML, y, CW, h).fill(t.lightFill).restore();
  L.doc.save().rect(ML, y, 4, h).fill(t.accent).restore();
  L.y = y + pad;
  const x = ML + 4 + pad;
  L.write(b.label, { size: 9, color: t.neutral, x, width: iw, gapAfter: 5 });
  L.write(b.value, { font: F.bold, size: 17, color: t.primary, x, width: iw, gapAfter: 6 });
  for (const l of b.lines) L.write(l, { size: 9, x, width: iw, gapAfter: 2 });
  L.y = y + h + 12;
}

function chartDims(b: Extract<Block, { type: "chart" }>) {
  const w = CW;
  return { w, h: (w * b.chart.height) / b.chart.width };
}

function drawChart(L: Layout, b: Extract<Block, { type: "chart" }>) {
  const t = L.t;
  const { w, h } = chartDims(b);
  const titleH = L.textHeight(b.title, F.bold, 10, CW) + 6;
  const capH = b.caption ? L.textHeight(b.caption, F.italic, 7.5, CW) + 4 : 0;
  L.ensure(titleH + h + capH + 6);
  L.write(b.title, { font: F.bold, size: 10, color: t.primary, gapAfter: 6 });
  const png = svgToPng(b.chart.svg, Math.round(w * 3.2));
  L.doc.image(Buffer.from(png), ML, L.y, { width: w, height: h });
  L.y += h + 4;
  if (b.caption) L.write(b.caption, { font: F.italic, size: 7.5, color: t.neutral, gapAfter: 2 });
  L.y += 14;
}

function drawBullets(L: Layout, b: Extract<Block, { type: "bullets" }>) {
  const t = L.t;
  const indent = 16;
  b.items.forEach((it, i) => {
    const h = L.textHeight(it, F.regular, BODY, CW - indent);
    if (h < LIMIT - MT) L.ensure(Math.min(h, 3 * 14));
    const y = L.y;
    L.at(b.numbered ? `${i + 1}.` : "–", ML, y, indent, F.regular, BODY, t.neutral);
    L.write(it, { x: ML + indent, width: CW - indent, gapAfter: 4 });
  });
  L.y += 6;
}

function drawParagraph(L: Layout, b: Extract<Block, { type: "paragraph" }>) {
  const t = L.t;
  const tone = b.tone ?? "body";
  const font = tone === "strong" ? F.bold : tone === "muted" ? F.italic : F.regular;
  const size = tone === "lead" ? 10.5 : BODY;
  const h = L.textHeight(b.text, font, size, CW);
  // avoid a widowed first line: need at least two lines or the whole paragraph
  L.ensure(Math.min(h, 2 * (size + LINE_GAP) + 2));
  L.write(b.text, { font, size, color: tone === "muted" ? t.neutral : tone === "strong" ? t.accent : t.text, gapAfter: 8 });
}

/** Minimum height that must fit together with a preceding heading (~3 lines or the block's first unit). */
function minNext(L: Layout, b: Block | undefined): number {
  const three = 3 * (BODY + LINE_GAP) + 4;
  if (!b) return three;
  switch (b.type) {
    case "chart": {
      const { h } = chartDims(b);
      return L.textHeight(b.title, F.bold, 10, CW) + 6 + h;
    }
    case "table": {
      const m = tableMetrics(L, b);
      const cap = b.caption ? L.textHeight(b.caption, F.bold, 9, CW) + 3 : 0;
      if (b.rows.length <= 16 && m.total <= LIMIT - MT) return cap + m.total;
      return cap + m.headerH + (m.rowHs[0] ?? 0) + (m.rowHs[1] ?? 0) + (m.rowHs[2] ?? 0);
    }
    case "kv": {
      const hs = b.items.map((it) => L.textHeight(`${it.label} ${it.value}`, F.regular, 9.2, CW * 0.6, 1) + 2 * PADY);
      const total = hs.reduce((a, x) => a + x, 0) + 8;
      return b.items.length <= 14 ? total : hs.slice(0, 3).reduce((a, x) => a + x, 0);
    }
    case "highlight":
      return 90;
    case "heading":
      return headingHeight(L, b.level, b.text) + three;
    case "paragraph":
      return Math.min(L.textHeight(b.text, F.regular, BODY, CW), three);
    default:
      return three;
  }
}

function drawHeading(L: Layout, level: 1 | 2 | 3, text: string, next: Block | undefined) {
  const t = L.t;
  const h = HEADING[level];
  const need = headingHeight(L, level, text) + minNext(L, next);
  if (L.remaining() < need) L.newPage();
  if (L.y > MT + 1) L.y += h.gapBefore;
  L.write(text, { font: F.bold, size: h.size, color: level === 3 ? t.accent : t.primary, gapAfter: h.gapAfter });
}

function drawBlocks(L: Layout, list: Block[]) {
  list.forEach((b, i) => {
    switch (b.type) {
      case "heading":
        drawHeading(L, b.level, b.text, list[i + 1]);
        break;
      case "paragraph":
        drawParagraph(L, b);
        break;
      case "bullets":
        drawBullets(L, b);
        break;
      case "table":
        drawTable(L, b);
        break;
      case "kv":
        drawKv(L, b);
        break;
      case "highlight":
        drawHighlight(L, b);
        break;
      case "chart":
        drawChart(L, b);
        break;
      case "pageBreak":
        L.newPage();
        break;
    }
  });
}

/* ------------------------------------------------------------------ */
/* Cover, header/footer                                                */
/* ------------------------------------------------------------------ */

function drawCover(L: Layout, m: ReportModel) {
  const t = L.t;
  const c = m.cover;
  const doc = L.doc;
  if (c.logoPng && c.logoPng.length > 8) {
    try {
      doc.image(Buffer.from(c.logoPng), ML, MT, { fit: [150, 56] });
    } catch {
      L.at(c.firmName.toUpperCase(), ML, MT, CW, F.bold, 9, t.neutral);
    }
  } else {
    doc.font(F.bold).fontSize(9).fillColor(t.neutral).text(c.firmName.toUpperCase(), ML, MT, { width: CW, characterSpacing: 1.5 });
  }
  L.y = 290;
  L.write(c.title, { size: 12, color: t.accent, gapAfter: 8 });
  L.write(c.clientName, { font: F.bold, size: 26, color: t.primary, gapAfter: 8, lineGap: 2 });
  L.hline(L.y + 2, t.primary, 1);
  L.y += 12;
  if (c.legalName) L.write(c.legalName, { size: 11, color: t.neutral, gapAfter: 6 });
  L.y += 16;
  const line = (label: string, value: string) => {
    const y = L.y;
    L.at(label, ML, y, 110, F.regular, 10, t.neutral);
    L.write(value, { x: ML + 110, width: CW - 110, size: 10, gapAfter: 5 });
    if (L.y < y + 15) L.y = y + 15;
  };
  line("Valuation date", c.valuationDate);
  if (c.purpose) line("Purpose", c.purpose);
  if (c.scope) line("Scope", c.scope);
  line("Prepared by", `${c.preparedBy}, ${c.firmName}`);
  if (c.contactEmail) line("Contact", c.contactEmail);
  line("Report date", c.reportDate);
  if (c.provisional) {
    const y = L.y + 36;
    doc.save().lineWidth(2).strokeColor(t.accent).rect(ML, y, 250, 46).stroke().restore();
    L.at("PROVISIONAL", ML + 14, y + 9, 230, F.bold, 18, t.accent);
    L.at("Open items remain. Not for reliance.", ML + 14, y + 30, 230, F.regular, 8, t.accent);
  }
}

function decoratePages(L: Layout, m: ReportModel) {
  const t = L.t;
  const doc = L.doc;
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = range.start; i < range.start + total; i++) {
    doc.switchToPage(i);
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const fy = PAGE_H - 48;
    L.hline(fy - 6, t.rule, 0.5);
    doc.font(F.regular).fontSize(7.5).fillColor(t.neutral);
    doc.text(m.footerText, ML, fy, { width: CW - 80, lineBreak: false, ellipsis: true });
    if (i > range.start) {
      doc.text(`Page ${i - range.start + 1} of ${total}`, ML + CW - 80, fy, { width: 80, align: "right", lineBreak: false });
      doc.text(m.runningTitle, ML, 40, { width: CW - 90, lineBreak: false, ellipsis: true });
      if (m.provisional) doc.font(F.bold).fillColor(t.accent).text("PROVISIONAL", ML + CW - 90, 40, { width: 90, align: "right", lineBreak: false });
    }
    doc.page.margins.bottom = saved;
  }
}

/* ------------------------------------------------------------------ */
/* Entry                                                               */
/* ------------------------------------------------------------------ */

export function renderReportPdfFromModel(m: ReportModel): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: MT, bottom: MB, left: ML, right: MR },
        bufferPages: true,
        info: { Title: `${m.cover.clientName} - ${m.cover.title}`, Author: `${m.cover.preparedBy}, ${m.cover.firmName}`, Subject: m.cover.title },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
      doc.on("error", reject);
      const L = new Layout(doc, theme(m));
      drawCover(L, m);
      for (const s of m.sections) {
        if (s.pageBreakBefore || L.remaining() < 160) L.newPage();
        else L.y += 18;
        drawHeading(L, 1, s.title, s.blocks[0]);
        drawBlocks(L, s.blocks);
      }
      decoratePages(L, m);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/** Render the advisory valuation report as PDF bytes. */
export async function renderReportPdf(ctx: ExportContext): Promise<Uint8Array> {
  return renderReportPdfFromModel(buildReportModel(ctx));
}
