/** Nine-slide 16:9 summary deck (pptxgenjs). Figures come from ctx only. */
import PptxGenJS from "pptxgenjs";
import { CHANNELS } from "@valuation/engine";
import { mix, svgToPng } from "../charts";
import type { ExportContext } from "../context";
import { CHANNEL_LABELS, fmtAmount, fmtDate, fmtMoney, fmtPct, fmtYears, humanize, officeFont } from "../report/format";
import { buildCharts, deriveRecommendations, deriveRisks, openItemsActive, spotFx } from "../report/model";

type Slide = PptxGenJS.Slide;
type Cell = PptxGenJS.TableCell;

const W = 13.333;
const H = 7.5;
const X = 0.6;
const CWD = W - 2 * X;

const hex = (c: string) => c.replace("#", "").toUpperCase();

export const DECK_DISCLAIMER_SHORT = "Advisory valuation, not a certified valuation by a licensed valuer.";

interface Theme {
  font: string;
  primary: string;
  accent: string;
  neutral: string;
  text: string;
  rule: string;
  light: string;
  accentLight: string;
}

export async function renderDeck(ctx: ExportContext): Promise<Uint8Array> {
  const r = ctx.result;
  const rec = r.reconciliation;
  const n = r.normalization;
  const e = ctx.engagement;
  const ccy = e.crossCheckCurrency || "USD";
  const charts = buildCharts(ctx);
  const p = charts.palette;
  const t: Theme = {
    font: officeFont(ctx.branding.typeface),
    primary: hex(p.primary),
    accent: hex(p.accent),
    neutral: hex(p.neutral),
    text: hex(mix(p.primary, "#000000", 0.35)),
    rule: hex(mix(p.neutral, "#FFFFFF", 0.65)),
    light: hex(mix(p.primary, "#FFFFFF", 0.93)),
    accentLight: hex(mix(p.accent, "#FFFFFF", 0.9)),
  };

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = `${ctx.branding.advisorName}, ${ctx.branding.firmName}`;
  pptx.company = ctx.branding.firmName;
  pptx.title = `${e.clientName} - ${e.title}`;
  pptx.theme = { headFontFace: t.font, bodyFontFace: t.font };

  const footer = [DECK_DISCLAIMER_SHORT, ctx.branding.footerText].filter(Boolean).join("  ");
  pptx.defineSlideMaster({
    title: "BODY",
    background: { color: "FFFFFF" },
    objects: [
      { line: { x: X, y: 6.95, w: CWD, h: 0, line: { color: t.rule, width: 0.75 } } },
      { text: { text: footer, options: { x: X, y: 7.0, w: CWD - 0.8, h: 0.3, fontFace: t.font, fontSize: 8, color: t.neutral, valign: "middle", margin: 0 } } },
    ],
    slideNumber: { x: W - X - 0.6, y: 7.0, w: 0.6, h: 0.3, fontFace: t.font, fontSize: 8, color: t.neutral, align: "right" },
  });

  const base = { fontFace: t.font, color: t.text, margin: 0 } as const;

  const newSlide = (title: string, kicker: string): Slide => {
    const s = pptx.addSlide({ masterName: "BODY" });
    s.addText(kicker.toUpperCase(), { ...base, x: X, y: 0.35, w: CWD - 2, h: 0.3, fontSize: 10, bold: true, color: t.accent, charSpacing: 1.5 });
    s.addText(title, { ...base, x: X, y: 0.65, w: CWD, h: 0.6, fontSize: 24, bold: true, color: t.primary });
    s.addShape(pptx.ShapeType.line, { x: X, y: 1.35, w: CWD, h: 0, line: { color: t.primary, width: 1 } });
    if (r.provisional) {
      s.addText("PROVISIONAL", { ...base, x: W - X - 2, y: 0.35, w: 2, h: 0.3, fontSize: 10, bold: true, color: t.accent, align: "right" });
    }
    return s;
  };

  const head = (txt: string, align: "left" | "right" = "left"): Cell => ({
    text: txt,
    options: { bold: true, color: t.primary, align, border: [{ type: "none" }, { type: "none" }, { pt: 1, color: t.primary }, { type: "none" }] },
  });
  const cell = (txt: string, align: "left" | "right" = "left", style: "normal" | "total" = "normal"): Cell => ({
    text: txt,
    options: {
      align,
      bold: style === "total",
      fill: style === "total" ? { color: t.light } : undefined,
      border: [style === "total" ? { pt: 0.75, color: t.primary } : { type: "none" }, { type: "none" }, { pt: 0.5, color: "E3E3E3" }, { type: "none" }],
    },
  });
  const tableOpts = (x: number, y: number, w: number, colW: number[], fontSize = 11) => ({
    x,
    y,
    w,
    colW,
    fontFace: t.font,
    fontSize,
    color: t.text,
    margin: [0.04, 0.06, 0.04, 0.06] as [number, number, number, number],
    valign: "middle" as const,
  });
  const kpi = (s: Slide, x: number, y: number, w: number, label: string, value: string, sub?: string) => {
    s.addShape(pptx.ShapeType.rect, { x, y, w, h: 1.15, fill: { color: t.light }, line: { color: t.light } });
    s.addText(label, { ...base, x: x + 0.2, y: y + 0.12, w: w - 0.4, h: 0.28, fontSize: 10, color: t.neutral });
    s.addText(value, { ...base, x: x + 0.2, y: y + 0.4, w: w - 0.4, h: 0.4, fontSize: 18, bold: true, color: t.primary });
    if (sub) s.addText(sub, { ...base, x: x + 0.2, y: y + 0.8, w: w - 0.4, h: 0.25, fontSize: 9, color: t.neutral });
  };
  const png = (svg: string, wIn: number) => `data:image/png;base64,${Buffer.from(svgToPng(svg, Math.round(wIn * 220))).toString("base64")}`;

  /* 1. Summary ------------------------------------------------------ */
  {
    const s = newSlide(e.clientName, `${e.title} | Valuation date ${fmtDate(e.valuationDate)}`);
    s.addText(`Concluded equity value${e.scope ? `, ${e.scope}` : ""}`, { ...base, x: X, y: 1.7, w: 8, h: 0.35, fontSize: 13, color: t.neutral });
    s.addText(`${fmtMoney(rec.roundedLow)} – ${fmtMoney(rec.roundedHigh)}`, { ...base, x: X, y: 2.1, w: 9, h: 0.9, fontSize: 40, bold: true, color: t.primary });
    s.addText(`Mid-point ${fmtMoney(rec.roundedMid)}`, { ...base, x: X, y: 3.0, w: 8, h: 0.45, fontSize: 20, color: t.accent, bold: true });
    const fx = spotFx(ctx);
    if (rec.usdLow !== null && rec.usdHigh !== null && rec.usdMid !== null && fx)
      s.addText(`${ccy} ${fmtAmount(rec.usdLow)} – ${fmtAmount(rec.usdHigh)} (mid ${fmtAmount(rec.usdMid)}) at spot ${fx.toFixed(2)} EGP/${ccy}`, {
        ...base,
        x: X,
        y: 3.5,
        w: 10,
        h: 0.35,
        fontSize: 12,
        color: t.neutral,
      });
    if (r.provisional) {
      s.addShape(pptx.ShapeType.rect, { x: W - X - 3.2, y: 1.75, w: 3.2, h: 0.9, fill: { color: "FFFFFF" }, line: { color: t.accent, width: 2 } });
      s.addText(
        [
          { text: "PROVISIONAL", options: { bold: true, fontSize: 20, color: t.accent, breakLine: true } },
          { text: "Open items remain. Not for reliance.", options: { fontSize: 10, color: t.accent } },
        ],
        { ...base, x: W - X - 3.1, y: 1.8, w: 3.0, h: 0.8, align: "center", valign: "middle", fontFace: t.font },
      );
    }
    const kw = (CWD - 0.6) / 4;
    const ky = 4.5;
    kpi(s, X, ky, kw, "TTM revenue", fmtMoney(n.revenue));
    kpi(s, X + (kw + 0.2), ky, kw, "Normalized EBITDA", fmtMoney(n.normalizedEbitda), `${fmtPct(n.normalizedMargin)} margin`);
    kpi(s, X + 2 * (kw + 0.2), ky, kw, "Weighted enterprise value (mid)", fmtMoney(rec.evMid), rec.methods.filter((m) => m.weight > 0).map((m) => `${m.method === "dcf" ? "DCF" : humanize(m.method)} ${fmtPct(m.weight)}`).join(", "));
    kpi(s, X + 3 * (kw + 0.2), ky, kw, "Value adjustments", fmtPct(r.adjustments.combinedDiscount), `Net equity bridge ${fmtMoney(r.bridge.netAdjustment)}`);
    s.addText(`Prepared by ${ctx.branding.advisorName}, ${ctx.branding.firmName}. ${humanize(e.standardOfValue)}, ${humanize(e.premise).toLowerCase()} premise, ${humanize(e.basis).toLowerCase()} basis.`, {
      ...base,
      x: X,
      y: 6.05,
      w: CWD,
      h: 0.35,
      fontSize: 10,
      color: t.neutral,
    });
  }

  /* 2. Business snapshot ------------------------------------------- */
  {
    const s = newSlide("Business snapshot", "Company");
    const pr = ctx.profile;
    const facts: [string, string][] = [];
    if (pr.concept) facts.push(["Concept", pr.concept]);
    if (pr.founded) facts.push(["Founded", pr.founded]);
    facts.push(["Trading units", `${ctx.input.units.length} (${ctx.input.units.map((u) => u.name).join(", ")})`]);
    facts.push(["Operating history", `${ctx.input.meta.monthsOfHistory} months`]);
    if (pr.brandAssets) facts.push(["Brand assets", pr.brandAssets]);
    const ops = ctx.input.operations;
    if (ops.dailyOrders !== null) facts.push(["Daily orders", fmtAmount(ops.dailyOrders)]);
    if (ops.averageTicket !== null) facts.push(["Average ticket", `EGP ${fmtAmount(ops.averageTicket)}`]);
    if (ops.ownerDependencyScore !== null) facts.push(["Owner dependency", `${ops.ownerDependencyScore} / 5`]);
    if (pr.description) s.addText(pr.description, { ...base, x: X, y: 1.6, w: 5.9, h: 0.8, fontSize: 13, valign: "top" });
    s.addTable(
      facts.map(([k, v]) => [cell(k), cell(v)]).map((row) => row.map((c, i) => ({ ...c, options: { ...c.options, color: i === 0 ? t.neutral : t.text } }))),
      tableOpts(X, 2.55, 5.9, [2.0, 3.9], 11),
    );
    s.addText("Channel mix, trailing twelve months", { ...base, x: 7.0, y: 1.6, w: 5.7, h: 0.3, fontSize: 12, bold: true, color: t.primary });
    s.addTable(
      [
        [head("Channel"), head("Revenue (EGP)", "right"), head("Share", "right")],
        ...CHANNELS.map((c) => [cell(CHANNEL_LABELS[c] ?? c), cell(fmtAmount(n.revenueByChannel[c]), "right"), cell(fmtPct(n.revenue > 0 ? n.revenueByChannel[c] / n.revenue : null), "right")]),
        [cell("Total", "left", "total"), cell(fmtAmount(n.revenue), "right", "total"), cell(fmtPct(n.revenue > 0 ? 1 : null), "right", "total")],
      ],
      tableOpts(7.0, 2.0, 5.73, [2.4, 2.03, 1.3], 11),
    );
    s.addText(
      `Normalized EBITDA ${fmtMoney(n.normalizedEbitda)} (${fmtPct(n.normalizedMargin)}) from reported ${fmtMoney(n.reportedEbitda)} (${fmtPct(n.reportedMargin)}).`,
      { ...base, x: 7.0, y: 4.6, w: 5.73, h: 0.6, fontSize: 11, color: t.neutral, valign: "top" },
    );
  }

  /* 3. Unit economics ---------------------------------------------- */
  {
    const s = newSlide("Unit economics", "Four-wall performance");
    const ue = r.unitEconomics;
    const rows: Cell[][] = [
      [head("Unit"), head("Months open", "right"), head("TTM sales", "right"), head("Prime cost", "right"), head("Rent", "right"), head("Four-wall EBITDA", "right"), head("Margin", "right"), head("Investment", "right"), head("Payback (yrs)", "right")],
      ...ue.rows.slice(0, 8).map((u) => [
        cell(u.name),
        cell(u.monthsOpen === null ? "n/a" : String(u.monthsOpen), "right"),
        cell(fmtAmount(u.sales), "right"),
        cell(fmtPct(u.primeCostPct), "right"),
        cell(fmtPct(u.rentPct), "right"),
        cell(fmtAmount(u.fourWallEbitda), "right"),
        cell(fmtPct(u.fourWallMargin), "right"),
        cell(fmtAmount(u.investment), "right"),
        cell(fmtYears(u.paybackYears), "right"),
      ]),
      [cell("Total", "left", "total"), cell("", "right", "total"), cell(fmtAmount(ue.totals.sales), "right", "total"), cell("", "right", "total"), cell("", "right", "total"), cell(fmtAmount(ue.totals.fourWallEbitda), "right", "total"), cell(fmtPct(ue.totals.fourWallMargin), "right", "total"), cell(fmtAmount(ue.totals.investment), "right", "total"), cell("", "right", "total")],
    ];
    s.addTable(rows, tableOpts(X, 1.7, CWD, [2.0, 1.1, 1.45, 1.15, 0.95, 1.6, 1.0, 1.45, 1.43], 11));
    const ky = 4.75;
    const kw = (CWD - 0.6) / 4;
    kpi(s, X, ky, kw, "New-unit mature sales", fmtMoney(ue.newUnitMatureSales), "Today's prices");
    kpi(s, X + kw + 0.2, ky, kw, "Capex per new unit", fmtMoney(ue.newUnitCapex));
    kpi(s, X + 2 * (kw + 0.2), ky, kw, "Mature four-wall margin", fmtPct(ue.newUnitFourWallMargin));
    kpi(s, X + 3 * (kw + 0.2), ky, kw, "New-unit payback", ue.newUnitPaybackYears === null ? "n/a" : `${fmtYears(ue.newUnitPaybackYears)} years`, `Ramp ${fmtPct(ue.rampY1)} / ${fmtPct(ue.rampY2)} of mature`);
  }

  /* 4. Growth plan --------------------------------------------------- */
  {
    const s = newSlide("Growth plan", "Base scenario");
    const yrs = r.dcf.scenarios?.base.years ?? [];
    if (yrs.length) {
      s.addTable(
        [
          [head(""), ...yrs.map((y) => head(`Year ${y.year}`, "right"))],
          [cell("New units opened"), ...yrs.map((y) => cell(String(y.newUnitsOpened), "right"))],
          [cell("Cumulative new units"), ...yrs.map((y) => cell(String(y.cumulativeNewUnits), "right"))],
          [cell("Revenue (EGP m)"), ...yrs.map((y) => cell((y.revenue / 1e6).toFixed(1), "right"))],
          [cell("EBITDA (EGP m)"), ...yrs.map((y) => cell((y.ebitda / 1e6).toFixed(1), "right"))],
          [cell("EBITDA margin"), ...yrs.map((y) => cell(fmtPct(y.ebitdaMargin), "right"))],
          [cell("Free cash flow (EGP m)", "left", "total"), ...yrs.map((y) => cell((y.fcff / 1e6).toFixed(1), "right", "total"))],
        ],
        tableOpts(X, 1.7, 6.0, [2.25, 0.75, 0.75, 0.75, 0.75, 0.75], 11),
      );
      s.addChart(
        pptx.ChartType.bar,
        [
          { name: "Existing units", labels: yrs.map((y) => `Year ${y.year}`), values: yrs.map((y) => Math.round(y.existingRevenue / 1e5) / 10) },
          { name: "New units", labels: yrs.map((y) => `Year ${y.year}`), values: yrs.map((y) => Math.round(y.newUnitRevenue / 1e5) / 10) },
        ],
        {
          x: 7.0,
          y: 1.6,
          w: 5.73,
          h: 4.3,
          barDir: "col",
          barGrouping: "stacked",
          chartColors: [t.primary, t.accent],
          showLegend: true,
          legendPos: "b",
          legendFontFace: t.font,
          legendFontSize: 10,
          legendColor: t.neutral,
          catAxisLabelFontFace: t.font,
          catAxisLabelFontSize: 10,
          catAxisLabelColor: t.neutral,
          valAxisLabelFontFace: t.font,
          valAxisLabelFontSize: 10,
          valAxisLabelColor: t.neutral,
          valAxisLabelFormatCode: "0",
          valGridLine: { color: "E6E6E6", size: 0.5 },
          catGridLine: { style: "none" },
          showTitle: true,
          title: "Revenue path, EGP millions (nominal)",
          titleFontFace: t.font,
          titleFontSize: 12,
          titleColor: t.primary,
        },
      );
    } else {
      s.addText(`The DCF forecast is not available. ${r.dcf.reason ?? ""}`, { ...base, x: X, y: 1.7, w: 6, h: 0.6, fontSize: 13 });
    }
    const plan = ctx.profile.growthPlan;
    s.addText(
      [
        ...(plan ? [{ text: "Management plan: ", options: { bold: true, color: t.primary } }, { text: plan, options: { breakLine: true } }] : []),
        {
          text: `Each new unit is modelled at ${fmtMoney(r.unitEconomics.newUnitMatureSales)} mature sales (today's prices) and ${fmtMoney(r.unitEconomics.newUnitCapex)} capex, ramping at ${fmtPct(r.unitEconomics.rampY1)} in year 1 and ${fmtPct(r.unitEconomics.rampY2)} in year 2.`,
          options: { color: t.neutral },
        },
      ],
      { ...base, x: X, y: 4.75, w: 6.0, h: 1.2, fontSize: 11, valign: "top", fontFace: t.font },
    );
  }

  /* 5. Valuation range ---------------------------------------------- */
  {
    const s = newSlide("Valuation range", "Reconciliation");
    const ff = charts.footballField;
    const iw = 8.1;
    const ih = (iw * ff.height) / ff.width;
    s.addImage({ data: png(ff.svg, iw), x: X, y: 1.65, w: iw, h: ih });
    s.addTable(
      [
        [head("Method (EV, EGP m)"), head("Mid", "right"), head("Weight", "right")],
        ...rec.methods.map((m) => [cell(m.label), cell(m.available ? (m.mid / 1e6).toFixed(1) : "n/a", "right"), cell(fmtPct(m.weight), "right")]),
        [cell("Weighted EV", "left", "total"), cell((rec.evMid / 1e6).toFixed(1), "right", "total"), cell(fmtPct(1), "right", "total")],
      ],
      tableOpts(9.0, 1.7, 3.73, [2.03, 0.8, 0.9], 10),
    );
    s.addText(
      [
        { text: "Concluded equity value", options: { bold: true, color: t.primary, breakLine: true } },
        { text: `${fmtMoney(rec.roundedLow)} – ${fmtMoney(rec.roundedHigh)}`, options: { breakLine: true } },
        { text: `after net bridge of ${fmtMoney(r.bridge.netAdjustment)} and ${fmtPct(r.adjustments.combinedDiscount)} value adjustments.`, options: { color: t.neutral } },
      ],
      { ...base, x: 9.0, y: 4.1, w: 3.73, h: 1.3, fontSize: 11, valign: "top", fontFace: t.font },
    );
    s.addText(rec.weightsRationale, { ...base, x: X, y: 1.65 + ih + 0.15, w: iw, h: 0.6, fontSize: 10, color: t.neutral, valign: "top" });
  }

  /* 6. Methodology --------------------------------------------------- */
  {
    const s = newSlide("Methodology", `${humanize(e.standardOfValue)} | ${humanize(e.premise)} | ${humanize(e.basis)}`);
    const steps: [string, string][] = [
      ["Normalization", "Addbacks to SDE, less a market-rate manager, to normalized EBITDA."],
      ["Unit economics", "Four-wall margin, prime cost, rent and payback per unit."],
      ["Discount rate", ctx.input.meta.discountRateMethod === "usd_buildup" ? "USD build-up translated to EGP by inflation differential." : "EGP T-bill build-up."],
      ["DCF", "Five-year forecast, three probability-weighted scenarios, blended terminal value."],
      ["Multiples", "EV/EBITDA, EV/Revenue, Price/SDE from sourced comparables."],
      ["Asset floor", "Recoverable value of fit-out, equipment and inventory, net of liquidation costs."],
      ["Adjustments", "Marketability, key-person, lease, delivery-app and FX discounts."],
      ["Bridge and reconciliation", "Weighted EV, floor test, net debt and deposits to equity, rounded."],
      ["Sensitivities", "Rate, growth, margin, same-store sales, units and capex."],
    ];
    const cw = (CWD - 0.5) / 3;
    const ch = 1.55;
    steps.forEach(([title, txt], i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = X + col * (cw + 0.25);
      const y = 1.65 + row * (ch + 0.15);
      s.addShape(pptx.ShapeType.line, { x, y, w: cw, h: 0, line: { color: t.rule, width: 0.75 } });
      s.addText(String(i + 1), { ...base, x, y: y + 0.12, w: 0.45, h: 0.45, fontSize: 20, bold: true, color: t.accent });
      s.addText(title, { ...base, x: x + 0.5, y: y + 0.15, w: cw - 0.5, h: 0.35, fontSize: 13, bold: true, color: t.primary });
      s.addText(txt, { ...base, x: x + 0.5, y: y + 0.55, w: cw - 0.5, h: 0.85, fontSize: 11, valign: "top" });
    });
  }

  /* 7. Risks and mitigants ------------------------------------------ */
  {
    const s = newSlide("Key risks and mitigants", "Risk factors from the data");
    const risks = deriveRisks(ctx).slice(0, 7);
    if (risks.length) {
      s.addTable(
        [[head("Risk"), head("Fact"), head("Mitigant")], ...risks.map((x) => [{ ...cell(x.title), options: { ...cell(x.title).options, bold: true, color: t.primary } }, cell(x.fact), cell(x.mitigant ?? "Monitor.")])],
        { ...tableOpts(X, 1.7, CWD, [2.4, 5.5, 4.233], 10.5), valign: "top" },
      );
    } else {
      s.addText("No specific risk factors were triggered by the data.", { ...base, x: X, y: 1.7, w: CWD, h: 0.5, fontSize: 13 });
    }
  }

  /* 8. Sensitivities -------------------------------------------------- */
  {
    const g = charts.heatmaps.find((h) => h.grid.key === "rate_growth") ?? charts.heatmaps[0];
    const s = newSlide(g ? g.grid.title : "Sensitivities", "Sensitivity of base-scenario enterprise value");
    if (g && g.grid.values.length) {
      const iw = 8.4;
      const ih = (iw * g.chart.height) / g.chart.width;
      s.addImage({ data: png(g.chart.svg, iw), x: X, y: 1.7, w: iw, h: ih });
      const flat = g.grid.values.flat();
      s.addText(
        [
          { text: "Reading the table", options: { bold: true, color: t.primary, breakLine: true } },
          { text: "Each cell re-runs the base-scenario DCF with the discount rate and terminal real growth shifted as shown; all else held constant.", options: { breakLine: true } },
          { text: " ", options: { breakLine: true } },
          { text: `Range across the grid: EGP ${(Math.min(...flat) / 1e6).toFixed(1)}m to EGP ${(Math.max(...flat) / 1e6).toFixed(1)}m enterprise value, before the equity bridge and value adjustments.`, options: { color: t.neutral } },
        ],
        { ...base, x: 9.3, y: 1.75, w: 3.43, h: 3.5, fontSize: 11, valign: "top", fontFace: t.font },
      );
    } else {
      s.addText("Sensitivities are not available because the DCF was not computed.", { ...base, x: X, y: 1.7, w: CWD, h: 0.5, fontSize: 13 });
    }
  }

  /* 9. Ask / next steps ---------------------------------------------- */
  {
    const s = newSlide("Ask and next steps", "Next steps");
    const pr = ctx.profile;
    const hasAsk = (pr.growthBudget !== null && pr.growthBudget !== undefined && pr.growthBudget > 0) || !!pr.pendingOffers;
    const steps: string[] = [];
    const blocking = openItemsActive(r).filter((i) => i.severity === "blocking").length;
    if (blocking) steps.push("Resolve the open items so the valuation can be finalised.");
    steps.push("Confirm the key assumptions and the growth plan with management.");
    const recs = deriveRecommendations(ctx).filter((x) => x.key !== "open_items").slice(0, 3);
    for (const x of recs) steps.push(`${x.title}.`);
    steps.push("Prepare a data room with monthly management accounts, leases and supplier contracts.");
    steps.push("Agree the transaction process and timetable with the advisor.");
    const listX = hasAsk ? 7.0 : X;
    const listW = hasAsk ? 5.73 : CWD;
    if (hasAsk) {
      const parts: PptxGenJS.TextProps[] = [{ text: "The ask", options: { bold: true, fontSize: 14, color: t.primary, breakLine: true } }];
      if (pr.growthBudget) parts.push({ text: `Growth budget: ${fmtMoney(pr.growthBudget)}`, options: { bold: true, fontSize: 20, color: t.accent, breakLine: true } });
      if (pr.growthPlan) parts.push({ text: `Use of funds: ${pr.growthPlan}`, options: { fontSize: 12, breakLine: true } });
      if (pr.pendingOffers) parts.push({ text: `Pending offers: ${pr.pendingOffers}`, options: { fontSize: 12, breakLine: true } });
      s.addShape(pptx.ShapeType.rect, { x: X, y: 1.7, w: 5.9, h: 3.2, fill: { color: t.light }, line: { color: t.light } });
      s.addShape(pptx.ShapeType.rect, { x: X, y: 1.7, w: 0.08, h: 3.2, fill: { color: t.accent }, line: { color: t.accent } });
      s.addText(parts, { ...base, x: X + 0.35, y: 1.9, w: 5.4, h: 2.8, valign: "top", fontFace: t.font, paraSpaceAfter: 8 });
    }
    s.addText("Next steps", { ...base, x: listX, y: 1.7, w: listW, h: 0.35, fontSize: 14, bold: true, color: t.primary });
    s.addText(
      steps.map((x) => ({ text: x, options: { bullet: { type: "number" as const }, breakLine: true } })),
      { ...base, x: listX, y: 2.15, w: listW, h: 4.3, fontSize: 12, valign: "top", fontFace: t.font, paraSpaceAfter: 6 },
    );
    if (ctx.branding.contactEmail)
      s.addText(`${ctx.branding.advisorName}, ${ctx.branding.firmName} | ${ctx.branding.contactEmail}`, { ...base, x: X, y: 6.45, w: CWD, h: 0.3, fontSize: 10, color: t.neutral });
  }

  const out = (await pptx.write({ outputType: "uint8array" })) as Uint8Array | ArrayBuffer;
  return out instanceof Uint8Array ? out : new Uint8Array(out);
}
