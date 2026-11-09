/** Word renderer for the report model. */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
  type IBorderOptions,
  type ParagraphChild,
} from "docx";
import { mix, svgToPng } from "../charts";
import type { ExportContext } from "../context";
import { officeFont } from "./format";
import { buildReportModel, type Block, type ReportModel, type RowStyle, type TableColumn } from "./model";

/* A4 portrait, twips */
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN_X = 1300;
const MARGIN_TOP = 1300;
const MARGIN_BOTTOM = 1250;
const CONTENT_W = PAGE_W - 2 * MARGIN_X;
const CONTENT_PX = Math.floor((CONTENT_W / 1440) * 96);

const hex = (c: string) => c.replace("#", "").toUpperCase();

interface Theme {
  font: string;
  primary: string;
  accent: string;
  neutral: string;
  text: string;
  rule: string;
  lightFill: string;
  accentFill: string;
}

function theme(m: ReportModel): Theme {
  const p = m.palette;
  return {
    font: officeFont(m.typeface),
    primary: hex(p.primary),
    accent: hex(p.accent),
    neutral: hex(p.neutral),
    text: hex(mix(p.primary, "#000000", 0.35)),
    rule: hex(mix(p.neutral, "#FFFFFF", 0.65)),
    lightFill: hex(mix(p.primary, "#FFFFFF", 0.93)),
    accentFill: hex(mix(p.accent, "#FFFFFF", 0.9)),
  };
}

const NONE: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };

function widths(cols: TableColumn[], total = CONTENT_W): number[] {
  const sum = cols.reduce((s, c) => s + c.width, 0);
  const w = cols.map((c) => Math.floor((c.width / sum) * total));
  w[w.length - 1]! += total - w.reduce((s, x) => s + x, 0);
  return w;
}

const align = (a: string) => (a === "right" ? AlignmentType.RIGHT : a === "center" ? AlignmentType.CENTER : AlignmentType.LEFT);

function tableBlock(t: Theme, b: Extract<Block, { type: "table" }>): (Paragraph | Table)[] {
  const ws = widths(b.columns);
  const size = b.small ? 16 : 18;
  const keepTogether = b.rows.length <= 16;
  const out: (Paragraph | Table)[] = [];
  if (b.caption)
    out.push(new Paragraph({ keepNext: true, spacing: { before: 120, after: 60 }, children: [new TextRun({ text: b.caption, bold: true, size: 18, color: t.text })] }));

  const hasHeader = b.columns.some((c) => c.header);
  const rows: TableRow[] = [];
  if (hasHeader) {
    rows.push(
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: b.columns.map(
          (c, i) =>
            new TableCell({
              width: { size: ws[i]!, type: WidthType.DXA },
              verticalAlign: VerticalAlign.BOTTOM,
              margins: { top: 50, bottom: 50, left: 80, right: 80 },
              borders: { top: NONE, left: NONE, right: NONE, bottom: { style: BorderStyle.SINGLE, size: 8, color: t.primary } },
              children: [
                new Paragraph({
                  keepNext: true,
                  alignment: align(c.align),
                  children: [new TextRun({ text: c.header, bold: true, size, color: t.primary })],
                }),
              ],
            }),
        ),
      }),
    );
  }
  b.rows.forEach((row, ri) => {
    const style: RowStyle = row.style ?? "normal";
    const last = ri === b.rows.length - 1;
    const bold = style === "total" || style === "subtotal" || style === "group";
    const color = style === "muted" ? t.neutral : style === "group" ? t.primary : t.text;
    const topBorder =
      style === "total"
        ? { style: BorderStyle.SINGLE, size: 6, color: t.primary }
        : style === "subtotal"
          ? { style: BorderStyle.SINGLE, size: 4, color: t.rule }
          : NONE;
    rows.push(
      new TableRow({
        cantSplit: true,
        children: row.cells.map(
          (cell, ci) =>
            new TableCell({
              width: { size: ws[ci]!, type: WidthType.DXA },
              margins: { top: 40, bottom: 40, left: 80, right: 80 },
              verticalAlign: VerticalAlign.TOP,
              shading: style === "total" ? { type: ShadingType.CLEAR, fill: t.lightFill, color: "auto" } : undefined,
              borders: {
                top: topBorder,
                left: NONE,
                right: NONE,
                bottom: last ? { style: BorderStyle.SINGLE, size: 4, color: t.rule } : { style: BorderStyle.SINGLE, size: 2, color: "EDEDED" },
              },
              children: [
                new Paragraph({
                  keepNext: (keepTogether && !last) || style === "group",
                  alignment: align(b.columns[ci]?.align ?? "left"),
                  children: [new TextRun({ text: cell, bold, size, color, italics: style === "muted" && ci === 0 })],
                }),
              ],
            }),
        ),
      }),
    );
  });
  out.push(
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: ws,
      layout: TableLayoutType.FIXED,
      borders: noBorders,
      rows,
    }),
  );
  out.push(
    new Paragraph({
      spacing: { before: 60, after: b.note ? 60 : 120 },
      children: b.note ? [new TextRun({ text: b.note, size: 16, color: t.neutral, italics: true })] : [],
    }),
  );
  return out;
}

function kvBlock(t: Theme, b: Extract<Block, { type: "kv" }>): (Paragraph | Table)[] {
  const ws = [Math.floor(CONTENT_W * 0.36), CONTENT_W - Math.floor(CONTENT_W * 0.36)];
  const keep = b.items.length <= 14;
  return [
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: ws,
      layout: TableLayoutType.FIXED,
      borders: noBorders,
      rows: b.items.map(
        (it, i) =>
          new TableRow({
            cantSplit: true,
            children: [it.label, it.value].map(
              (txt, ci) =>
                new TableCell({
                  width: { size: ws[ci]!, type: WidthType.DXA },
                  margins: { top: 40, bottom: 40, left: ci === 0 ? 0 : 80, right: 80 },
                  borders: { top: NONE, left: NONE, right: NONE, bottom: { style: BorderStyle.SINGLE, size: 2, color: "EDEDED" } },
                  children: [
                    new Paragraph({
                      keepNext: keep && i < b.items.length - 1,
                      children: [new TextRun({ text: txt, size: 19, color: ci === 0 ? t.neutral : t.text })],
                    }),
                  ],
                }),
            ),
          }),
      ),
    }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  ];
}

function highlightBlock(t: Theme, b: Extract<Block, { type: "highlight" }>): (Paragraph | Table)[] {
  return [
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [CONTENT_W],
      layout: TableLayoutType.FIXED,
      borders: noBorders,
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: { size: CONTENT_W, type: WidthType.DXA },
              shading: { type: ShadingType.CLEAR, fill: t.lightFill, color: "auto" },
              margins: { top: 200, bottom: 200, left: 280, right: 280 },
              borders: { top: NONE, bottom: NONE, right: NONE, left: { style: BorderStyle.SINGLE, size: 24, color: t.accent } },
              children: [
                new Paragraph({ keepNext: true, spacing: { after: 80 }, children: [new TextRun({ text: b.label, size: 18, color: t.neutral })] }),
                new Paragraph({ keepNext: true, spacing: { after: 100 }, children: [new TextRun({ text: b.value, size: 36, bold: true, color: t.primary })] }),
                ...b.lines.map((l) => new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: l, size: 18, color: t.text })] })),
              ],
            }),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 160 }, children: [] }),
  ];
}

function chartBlock(t: Theme, b: Extract<Block, { type: "chart" }>): Paragraph[] {
  const wPx = CONTENT_PX;
  const hPx = Math.round((wPx * b.chart.height) / b.chart.width);
  const png = svgToPng(b.chart.svg, wPx * 2.5);
  return [
    new Paragraph({ keepNext: true, keepLines: true, spacing: { before: 160, after: 80 }, children: [new TextRun({ text: b.title, bold: true, size: 20, color: t.primary })] }),
    new Paragraph({
      keepNext: !!b.caption,
      spacing: { after: 60, line: 240, lineRule: LineRuleType.AUTO },
      children: [new ImageRun({ type: "png", data: png, transformation: { width: wPx, height: hPx }, altText: { name: b.title, title: b.title, description: b.caption ?? b.title } })],
    }),
    ...(b.caption ? [new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: b.caption, size: 16, italics: true, color: t.neutral })] })] : []),
  ];
}

function blocks(t: Theme, list: Block[], listCounter: { n: number }): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  for (const b of list) {
    switch (b.type) {
      case "heading": {
        const heading = b.level === 1 ? HeadingLevel.HEADING_1 : b.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
        out.push(new Paragraph({ heading, keepNext: true, keepLines: true, children: [new TextRun(b.text)] }));
        break;
      }
      case "paragraph": {
        const tone = b.tone ?? "body";
        out.push(
          new Paragraph({
            spacing: { after: 140 },
            children: [
              new TextRun({
                text: b.text,
                bold: tone === "strong",
                italics: tone === "muted",
                size: tone === "lead" ? 22 : 20,
                color: tone === "muted" ? t.neutral : tone === "strong" ? t.accent : t.text,
              }),
            ],
          }),
        );
        break;
      }
      case "bullets": {
        const instance = ++listCounter.n;
        b.items.forEach((it, i) =>
          out.push(
            new Paragraph({
              numbering: { reference: b.numbered ? "numbers" : "bullets", level: 0, instance: b.numbered ? instance : undefined },
              spacing: { after: i === b.items.length - 1 ? 160 : 80 },
              children: [new TextRun({ text: it, size: 20, color: t.text })],
            }),
          ),
        );
        break;
      }
      case "table":
        out.push(...tableBlock(t, b));
        break;
      case "kv":
        out.push(...kvBlock(t, b));
        break;
      case "highlight":
        out.push(...highlightBlock(t, b));
        break;
      case "chart":
        out.push(...chartBlock(t, b));
        break;
      case "pageBreak":
        out.push(new Paragraph({ pageBreakBefore: true, children: [] }));
        break;
    }
  }
  return out;
}

function coverChildren(t: Theme, m: ReportModel): Paragraph[] {
  const c = m.cover;
  const out: Paragraph[] = [];
  if (c.logoPng && c.logoPng.length > 8) {
    out.push(
      new Paragraph({
        spacing: { after: 600 },
        children: [new ImageRun({ type: "png", data: c.logoPng, transformation: { width: 160, height: 60 }, altText: { name: "Logo", title: "Logo", description: c.firmName } })],
      }),
    );
  } else {
    out.push(new Paragraph({ spacing: { before: 0, after: 600 }, children: [new TextRun({ text: c.firmName.toUpperCase(), size: 18, bold: true, color: t.neutral, characterSpacing: 40 })] }));
  }
  out.push(new Paragraph({ spacing: { before: 2400, after: 200 }, children: [new TextRun({ text: c.title, size: 24, color: t.accent })] }));
  out.push(
    new Paragraph({
      spacing: { after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: t.primary, space: 12 } },
      children: [new TextRun({ text: c.clientName, size: 52, bold: true, color: t.primary })],
    }),
  );
  if (c.legalName) out.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: c.legalName, size: 22, color: t.neutral })] }));
  const line = (label: string, value: string) =>
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: `${label}  `, size: 20, color: t.neutral }), new TextRun({ text: value, size: 20, color: t.text })],
    });
  out.push(new Paragraph({ spacing: { before: 360 }, children: [] }));
  out.push(line("Valuation date", c.valuationDate));
  if (c.purpose) out.push(line("Purpose", c.purpose));
  if (c.scope) out.push(line("Scope", c.scope));
  out.push(line("Prepared by", `${c.preparedBy}, ${c.firmName}`));
  if (c.contactEmail) out.push(line("Contact", c.contactEmail));
  out.push(line("Report date", c.reportDate));
  if (c.provisional) {
    const bd = { style: BorderStyle.SINGLE, size: 18, color: t.accent, space: 6 };
    out.push(
      new Paragraph({
        spacing: { before: 720 },
        alignment: AlignmentType.LEFT,
        border: { top: bd, bottom: bd, left: bd, right: bd },
        children: [
          new TextRun({ text: "PROVISIONAL", bold: true, size: 32, color: t.accent, characterSpacing: 60 }),
          new TextRun({ text: "    Open items remain. Not for reliance.", size: 18, color: t.accent }),
        ],
      }),
    );
  }
  return out;
}

function footer(t: Theme, m: ReportModel, withPages: boolean): Footer {
  const children: ParagraphChild[] = [new TextRun({ text: m.footerText, size: 15, color: t.neutral })];
  if (withPages) children.push(new TextRun({ children: ["\tPage ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 15, color: t.neutral }));
  return new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: t.rule, space: 6 } },
        children,
      }),
    ],
  });
}

function header(t: Theme, m: ReportModel): Header {
  const children: ParagraphChild[] = [new TextRun({ text: m.runningTitle, size: 15, color: t.neutral })];
  if (m.provisional) children.push(new TextRun({ text: "\tPROVISIONAL", size: 15, bold: true, color: t.accent }));
  return new Header({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }], children })] });
}

export function renderReportDocxFromModel(m: ReportModel): Promise<Uint8Array> {
  const t = theme(m);
  const listCounter = { n: 0 };
  const body: (Paragraph | Table)[] = [];
  for (const s of m.sections) {
    body.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: s.pageBreakBefore && body.length > 0,
        keepNext: true,
        keepLines: true,
        children: [new TextRun(s.title)],
      }),
    );
    body.push(...blocks(t, s.blocks, listCounter));
  }
  const page = { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_X, right: MARGIN_X, header: 600, footer: 600 } };
  const doc = new Document({
    creator: m.cover.firmName,
    title: `${m.cover.clientName} - ${m.cover.title}`,
    description: m.cover.title,
    styles: {
      default: {
        document: { run: { font: t.font, size: 20, color: t.text }, paragraph: { spacing: { line: 276, lineRule: LineRuleType.AUTO } } },
        heading1: { run: { font: t.font, size: 30, bold: true, color: t.primary }, paragraph: { keepNext: true, keepLines: true, spacing: { before: 240, after: 200 } } },
        heading2: { run: { font: t.font, size: 24, bold: true, color: t.primary }, paragraph: { keepNext: true, keepLines: true, spacing: { before: 320, after: 120 } } },
        heading3: { run: { font: t.font, size: 20, bold: true, color: t.accent }, paragraph: { keepNext: true, keepLines: true, spacing: { before: 200, after: 100 } } },
      },
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 280 } } } }],
        },
        {
          reference: "numbers",
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 360 } } } }],
        },
      ],
    },
    sections: [
      { properties: { page }, footers: { default: footer(t, m, false) }, children: coverChildren(t, m) },
      { properties: { page }, headers: { default: header(t, m) }, footers: { default: footer(t, m, true) }, children: body },
    ],
  });
  return Packer.toBuffer(doc).then((buf) => new Uint8Array(buf));
}

/** Render the advisory valuation report as a Word document (.docx bytes). */
export async function renderReportDocx(ctx: ExportContext): Promise<Uint8Array> {
  return renderReportDocxFromModel(buildReportModel(ctx));
}
