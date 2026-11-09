import ExcelJS from "exceljs";
import {
  CATALOGUE,
  CHANNELS,
  SCENARIOS,
  SENS_CAPEX,
  SENS_GROWTH,
  SENS_MARGIN,
  SENS_RATE,
  SENS_SSS,
  SENS_UNITS,
  UNIT_COST_LINES,
  type ResolvedAssumption,
} from "@valuation/engine";
import type { ExportContext } from "../context";
import { SECTION_LABELS } from "../context";

/* ------------------------------------------------------------------ */
/* Style helpers                                                       */
/* ------------------------------------------------------------------ */

const BLUE = "FF0000FF";
const BLACK = "FF000000";
const FMT = {
  egp: '#,##0.00;(#,##0.00);"–"',
  egp0: '#,##0;(#,##0);"–"',
  pct: "0.00%",
  x: '0.00"x"',
  num: "#,##0.00",
  int: "0",
  factor: "0.000000",
  date: "yyyy-mm-dd",
  fx: "#,##0.0000",
};

const unitFmt = (u: string) =>
  u === "pct" ? FMT.pct : u === "x" ? FMT.x : u === "egp" ? FMT.egp : u === "egp_per_usd" ? FMT.fx : FMT.num;

const colL = (n: number) => {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const q = (sheet: string) => `'${sheet}'`;
const abs = (sheet: string, col: number, row: number) => `${q(sheet)}!$${colL(col)}$${row}`;
const nameOf = (key: string) => `A_${key.replace(/\./g, "_")}`;

type Val = number | string | boolean | Date | null | undefined;

class SheetW {
  ws: ExcelJS.Worksheet;
  row = 1;
  constructor(
    readonly wb: ExcelJS.Workbook,
    readonly name: string,
    readonly brand: { primary: string; accent: string },
    widths: number[],
  ) {
    this.ws = wb.addWorksheet(name, {
      pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
      properties: { defaultRowHeight: 16 },
    });
    widths.forEach((w, i) => (this.ws.getColumn(i + 1).width = w));
    this.ws.headerFooter.oddFooter = `&L&8${name}&R&8Page &P of &N`;
  }

  ref(col: number, row: number) {
    return abs(this.name, col, row);
  }

  title(text: string, sub?: string) {
    const c = this.ws.getCell(this.row, 1);
    c.value = text;
    c.font = { name: "Calibri", size: 14, bold: true, color: { argb: argb(this.brand.primary) } };
    this.row++;
    if (sub) {
      const s = this.ws.getCell(this.row, 1);
      s.value = sub;
      s.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF5B6472" } };
      this.row++;
    }
    this.row++;
  }

  section(text: string) {
    const c = this.ws.getCell(this.row, 1);
    c.value = text;
    c.font = { name: "Calibri", size: 11, bold: true, color: { argb: argb(this.brand.primary) } };
    c.border = { bottom: { style: "thin", color: { argb: argb(this.brand.accent) } } };
    this.row++;
  }

  header(cells: string[], startCol = 1) {
    cells.forEach((t, i) => {
      const c = this.ws.getCell(this.row, startCol + i);
      c.value = t;
      c.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(this.brand.primary) } };
      c.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "right", wrapText: true };
    });
    return this.row++;
  }

  /** Write an input value (blue). */
  input(col: number, row: number, v: Val, fmt?: string) {
    const c = this.ws.getCell(row, col);
    c.value = v === undefined ? null : (v as ExcelJS.CellValue);
    c.font = { name: "Calibri", size: 10, color: { argb: BLUE } };
    if (fmt) c.numFmt = fmt;
    return this.ref(col, row);
  }

  /** Write a formula (black). */
  f(col: number, row: number, formula: string, fmt?: string, bold = false) {
    const c = this.ws.getCell(row, col);
    c.value = { formula: formula.replace(/^=/, "") } as ExcelJS.CellFormulaValue;
    c.font = { name: "Calibri", size: 10, color: { argb: BLACK }, bold };
    if (fmt) c.numFmt = fmt;
    return this.ref(col, row);
  }

  /** Static label / narrative text. */
  label(col: number, row: number, text: string, opts: { bold?: boolean; italic?: boolean; indent?: number } = {}) {
    const c = this.ws.getCell(row, col);
    c.value = text;
    c.font = { name: "Calibri", size: 10, bold: opts.bold, italic: opts.italic, color: { argb: BLACK } };
    if (opts.indent) c.alignment = { indent: opts.indent };
    return this.ref(col, row);
  }

  freeze(ySplit: number, xSplit = 1) {
    this.ws.views = [{ state: "frozen", ySplit, xSplit, showGridLines: false }];
    this.ws.pageSetup.printTitlesRow = `${ySplit}:${ySplit}`;
  }

  blank(n = 1) {
    this.row += n;
  }
}

function argb(hex: string) {
  return "FF" + hex.replace("#", "").toUpperCase().padStart(6, "0").slice(0, 6);
}

/* ------------------------------------------------------------------ */
/* Forecast block — mirrors engine/src/forecast.ts line by line        */
/* ------------------------------------------------------------------ */

export interface BlockParams {
  baseRevenue: string;
  baseMargin: string;
  inflation: string[];
  sssReal: string;
  marginDelta: string;
  marginShift: string;
  newUnits: string[];
  matureSales: string;
  capexPerUnit: string;
  rampY1: string;
  rampY2: string;
  daPct: string;
  maintCapexPct: string;
  nwcPct: string;
  taxRate: string;
  rates: string[];
  terminalRate: string;
  gRealLt: string;
  inflationLt: string;
  exitMultiple: string;
  tvWeightGordon: string;
}

export interface BlockRefs {
  revenue: string[];
  ebitda: string[];
  fcff: string[];
  priceIndex: string[];
  sumPv: string;
  tvGordon: string;
  tvExit: string;
  terminalGrowth: string;
  ev: string;
  firstRow: number;
  lastRow: number;
}

function forecastBlock(s: SheetW, title: string, p: BlockParams): BlockRefs {
  s.section(title);
  const hdr = s.header(["", "Year 0", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"]);
  const C = (t: number) => 2 + t; // year t column (year 0 = column B)
  const L = (t: number) => colL(C(t));
  const R: Record<string, number> = {};
  const rowsDef = [
    "EGP inflation",
    "Price index",
    "Existing-unit revenue",
    "New units opened",
    "Cumulative new units",
    "New-unit revenue",
    "Revenue",
    "EBITDA margin",
    "EBITDA",
    "Depreciation & amortisation",
    "EBIT",
    "Tax",
    "Expansion capex",
    "Maintenance capex",
    "Change in NWC",
    "Free cash flow to firm",
    "Discount rate",
    "Cumulative discount factor",
    "Mid-year discount factor",
    "Present value",
  ];
  rowsDef.forEach((label, i) => {
    R[label] = hdr + 1 + i;
    s.label(1, hdr + 1 + i, label, { bold: label === "Revenue" || label === "Free cash flow to firm" || label === "EBITDA" });
  });
  const cell = (label: string, t: number) => `${L(t)}${R[label]}`;
  // Year 0
  s.f(C(0), R["Price index"]!, "=1", FMT.factor);
  s.f(C(0), R["Existing-unit revenue"]!, `=${p.baseRevenue}`, FMT.egp);
  s.f(C(0), R["Cumulative new units"]!, "=0", FMT.int);
  s.f(C(0), R["Revenue"]!, `=${p.baseRevenue}`, FMT.egp);
  s.f(C(0), R["Cumulative discount factor"]!, "=1", FMT.factor);

  for (let t = 1; t <= 5; t++) {
    const col = C(t);
    s.f(col, R["EGP inflation"]!, `=${p.inflation[t - 1]}`, FMT.pct);
    s.f(col, R["Price index"]!, `=${cell("Price index", t - 1)}*(1+${cell("EGP inflation", t)})`, FMT.factor);
    s.f(col, R["Existing-unit revenue"]!, `=${cell("Existing-unit revenue", t - 1)}*(1+${p.sssReal})*(1+${cell("EGP inflation", t)})`, FMT.egp);
    s.f(col, R["New units opened"]!, `=${p.newUnits[t - 1]}`, FMT.int);
    s.f(col, R["Cumulative new units"]!, `=${cell("Cumulative new units", t - 1)}+${cell("New units opened", t)}`, FMT.int);
    const openedPrev = t >= 2 ? cell("New units opened", t - 1) : "0";
    const matureCount = t >= 3 ? cell("Cumulative new units", t - 2) : "0";
    s.f(
      col,
      R["New-unit revenue"]!,
      `=${p.matureSales}*${cell("Price index", t)}*(${p.rampY1}*${cell("New units opened", t)}+${p.rampY2}*${openedPrev}+${matureCount})`,
      FMT.egp,
    );
    s.f(col, R["Revenue"]!, `=${cell("Existing-unit revenue", t)}+${cell("New-unit revenue", t)}`, FMT.egp, true);
    s.f(col, R["EBITDA margin"]!, `=${p.baseMargin}+${p.marginShift}+${p.marginDelta}*${t}/5`, FMT.pct);
    s.f(col, R["EBITDA"]!, `=${cell("Revenue", t)}*${cell("EBITDA margin", t)}`, FMT.egp, true);
    s.f(col, R["Depreciation & amortisation"]!, `=${cell("Revenue", t)}*${p.daPct}`, FMT.egp);
    s.f(col, R["EBIT"]!, `=${cell("EBITDA", t)}-${cell("Depreciation & amortisation", t)}`, FMT.egp);
    s.f(col, R["Tax"]!, `=MAX(0,${cell("EBIT", t)})*${p.taxRate}`, FMT.egp);
    s.f(col, R["Expansion capex"]!, `=${cell("New units opened", t)}*${p.capexPerUnit}*${cell("Price index", t)}`, FMT.egp);
    s.f(col, R["Maintenance capex"]!, `=${cell("Revenue", t)}*${p.maintCapexPct}`, FMT.egp);
    s.f(col, R["Change in NWC"]!, `=${p.nwcPct}*(${cell("Revenue", t)}-${cell("Revenue", t - 1)})`, FMT.egp);
    s.f(
      col,
      R["Free cash flow to firm"]!,
      `=${cell("EBITDA", t)}-${cell("Tax", t)}-(${cell("Expansion capex", t)}+${cell("Maintenance capex", t)})-${cell("Change in NWC", t)}`,
      FMT.egp,
      true,
    );
    s.f(col, R["Discount rate"]!, `=${p.rates[t - 1]}`, FMT.pct);
    s.f(col, R["Mid-year discount factor"]!, `=1/(${cell("Cumulative discount factor", t - 1)}*SQRT(1+${cell("Discount rate", t)}))`, FMT.factor);
    s.f(col, R["Cumulative discount factor"]!, `=${cell("Cumulative discount factor", t - 1)}*(1+${cell("Discount rate", t)})`, FMT.factor);
    s.f(col, R["Present value"]!, `=${cell("Free cash flow to firm", t)}*${cell("Mid-year discount factor", t)}`, FMT.egp);
  }
  let r = hdr + rowsDef.length + 1;
  const kv = (label: string, formula: string, fmt: string, bold = false) => {
    s.label(1, r, label, { bold });
    const ref = s.f(3, r, formula, fmt, bold);
    r++;
    return ref;
  };
  const pvs = [1, 2, 3, 4, 5].map((t) => cell("Present value", t));
  const sumPv = kv("Sum of PV (years 1-5)", `=${pvs.join("+")}`, FMT.egp);
  const g = kv("Terminal nominal growth", `=(1+${p.gRealLt})*(1+${p.inflationLt})-1`, FMT.pct);
  const tf = kv(
    "Terminal FCFF (no expansion capex)",
    `=(${cell("EBITDA", 5)}-${cell("Tax", 5)}-${cell("Maintenance capex", 5)})*(1+${g})-${p.nwcPct}*${cell("Revenue", 5)}*${g}`,
    FMT.egp,
  );
  const tvg = kv("Terminal value: Gordon growth", `=${tf}/(${p.terminalRate}-${g})`, FMT.egp);
  const tvx = kv("Terminal value: exit multiple", `=${cell("EBITDA", 5)}*${p.exitMultiple}`, FMT.egp);
  const dfe = kv("Discount factor at end of year 5", `=1/${cell("Cumulative discount factor", 5)}`, FMT.factor);
  const evg = kv("EV (Gordon)", `=${sumPv}+${tvg}*${dfe}`, FMT.egp);
  const evx = kv("EV (exit multiple)", `=${sumPv}+${tvx}*${dfe}`, FMT.egp);
  const ev = kv("Enterprise value (blended)", `=${p.tvWeightGordon}*${evg}+(1-${p.tvWeightGordon})*${evx}`, FMT.egp, true);
  const first = hdr - 1;
  s.row = r + 1;
  const abs2 = (a: string) => `${q(s.name)}!$${a.replace(/(\d+)/, "\\$$1")}`;
  const refOf = (label: string) => [1, 2, 3, 4, 5].map((t) => `${q(s.name)}!$${L(t)}$${R[label]}`);
  void abs2;
  return {
    revenue: refOf("Revenue"),
    ebitda: refOf("EBITDA"),
    fcff: refOf("Free cash flow to firm"),
    priceIndex: refOf("Price index"),
    sumPv,
    tvGordon: tvg,
    tvExit: tvx,
    terminalGrowth: g,
    ev,
    firstRow: first,
    lastRow: r,
  };
}

/* ------------------------------------------------------------------ */
/* Workbook                                                            */
/* ------------------------------------------------------------------ */

export interface WorkbookMap {
  /** Engine path -> absolute cell reference, used by the reconciliation test. */
  checks: Record<string, string>;
}

export async function buildWorkbook(ctx: ExportContext): Promise<{ buffer: Uint8Array; map: WorkbookMap }> {
  const { input, result, branding, engagement } = ctx;
  const wb = new ExcelJS.Workbook();
  wb.creator = branding.advisorName;
  wb.created = new Date(ctx.generatedAt);
  wb.calcProperties = { fullCalcOnLoad: true };
  const brand = { primary: branding.primaryColor, accent: branding.accentColor };
  const checks: Record<string, string> = {};
  const sourceTitle = new Map(ctx.sources.map((s) => [s.id, s]));
  const nm = (key: string) => nameOf(key);

  /* Sheets are created in display order; content filled below. */
  const cover = new SheetW(wb, "Cover", brand, [30, 70]);
  const inp = new SheetW(wb, "Inputs", brand, [34, 52, 16, 10, 12, 11, 40, 12, 8, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14]);
  const nor = new SheetW(wb, "Normalization", brand, [46, 18, 50]);
  const ue = new SheetW(wb, "Unit Economics", brand, [24, 14, 12, 14, 14, 14, 14, 10, 14, 10, 14, 14, 10, 14, 10, 10, 10, 12]);
  const fc = new SheetW(wb, "Forecast", brand, [36, 16, 16, 16, 16, 16, 16]);
  const dcfS = new SheetW(wb, "DCF", brand, [44, 16, 16, 16, 16, 16, 16]);
  const mu = new SheetW(wb, "Multiples", brand, [30, 12, 10, 12, 11, 11, 11, 9, 34, 11, 11, 11]);
  const af = new SheetW(wb, "Asset Floor", brand, [34, 16, 14, 16]);
  const adj = new SheetW(wb, "Adjustments", brand, [34, 14, 14, 70]);
  const rec = new SheetW(wb, "Reconciliation", brand, [36, 16, 16, 16, 12, 40]);
  const sen = new SheetW(wb, "Sensitivities", brand, [36, 16, 16, 16, 16, 16, 16]);
  const log = new SheetW(wb, "Assumption Log", brand, [34, 46, 16, 16, 10, 10, 40, 12, 8]);
  const src = new SheetW(wb, "Sources", brand, [12, 50, 24, 50, 14, 20, 14]);

  /* ---------------- Inputs ---------------- */
  inp.title("Inputs", "Blue = input or sourced value. Black = formula. All amounts in nominal EGP unless stated.");
  inp.section("Engagement");
  const meta = (label: string, v: Val, fmt?: string, name?: string) => {
    inp.label(1, inp.row, label);
    const ref = inp.input(3, inp.row, v, fmt);
    if (name) wb.definedNames.add(ref, name);
    inp.row++;
    return ref;
  };
  meta("Company", input.meta.companyName);
  meta("Valuation date", new Date(input.meta.valuationDate + "T00:00:00Z"), FMT.date, "I_ValDate");
  meta("Months of operating history", input.meta.monthsOfHistory, FMT.int, "I_Months");
  meta("Discount-rate method", input.meta.discountRateMethod, undefined, "I_DrMethod");
  meta("Head-office costs (TTM)", input.headOfficeCosts, FMT.egp, "I_HeadOffice");
  meta("Inventory (book value)", input.operations.inventoryValue ?? null, FMT.egp, "I_Inventory");
  meta("Owner dependency score (1-5)", input.operations.ownerDependencyScore ?? null, FMT.int, "I_OwnerDep");
  meta("Imported share of COGS", input.operations.importedCogsShare ?? null, FMT.pct, "I_ImportShare");
  inp.blank();

  // Growth plan
  inp.section("Growth plan (new units per year)");
  inp.header(["", "", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"]);
  inp.label(1, inp.row, "Planned new units (client plan)");
  for (let y = 1; y <= 5; y++) {
    const ref = inp.input(2 + y, inp.row, input.growthPlan.newUnitsByYear[y - 1] ?? 0, FMT.int);
    wb.definedNames.add(ref, `I_Plan_y${y}`);
  }
  inp.row += 2;

  // Units table
  inp.section("Units: trailing twelve months");
  const unitCols = [
    "Unit",
    "Opened",
    "TTM months",
    ...CHANNELS.map((c) => `Revenue: ${c.replace("_", "-")}`),
    ...UNIT_COST_LINES.map((l) => l.replace(/_/g, " ")),
    "Capex: fit-out",
    "Capex: equipment",
    "Capex: furniture",
    "Capex: other",
    "Lease years left",
  ];
  inp.header(unitCols);
  const uFirst = inp.row;
  input.units.forEach((u) => {
    const r = inp.row;
    inp.input(1, r, u.name);
    inp.input(2, r, u.openedOn ? new Date(u.openedOn + "T00:00:00Z") : null, FMT.date);
    inp.input(3, r, u.ttmMonths, FMT.int);
    CHANNELS.forEach((c, i) => inp.input(4 + i, r, u.ttmRevenue[c] ?? 0, FMT.egp0));
    UNIT_COST_LINES.forEach((l, i) => inp.input(8 + i, r, u.ttmCosts[l] ?? 0, FMT.egp0));
    (["fit_out", "equipment", "furniture", "other"] as const).forEach((cat, i) =>
      inp.input(16 + i, r, u.capex.filter((x) => x.category === cat).reduce((a, x) => a + x.cost, 0), FMT.egp0),
    );
    inp.input(20, r, u.lease?.yearsRemaining ?? null, FMT.num);
    inp.row++;
  });
  const uLast = Math.max(uFirst, inp.row - 1);
  const ucol = (c: number) => `Inputs!$${colL(c)}$${uFirst}:$${colL(c)}$${uLast}`;
  const ucell = (c: number, r: number) => `Inputs!$${colL(c)}$${r}`;
  inp.blank();

  // Monthly revenue by month since opening (for observed ramp)
  const maxIdx = Math.max(0, ...input.units.flatMap((u) => u.monthlyRevenue.map((m) => m.monthIndex)));
  inp.section("Monthly revenue by month since opening (observed ramp-up)");
  const monthHdr = inp.header(["Unit", ...Array.from({ length: Math.max(1, maxIdx) }, (_, i) => `M${i + 1}`)]);
  const mFirst = inp.row;
  input.units.forEach((u) => {
    inp.input(1, inp.row, u.name);
    for (const m of u.monthlyRevenue) if (m.monthIndex >= 1) inp.input(1 + m.monthIndex, inp.row, m.amount, FMT.egp0);
    inp.row++;
  });
  void monthHdr;
  inp.blank();

  // Addbacks
  inp.section("Normalization add-backs (TTM)");
  inp.header(["Kind", "Description", "Amount"]);
  const abFirst = inp.row;
  input.addbacks.forEach((a) => {
    inp.input(1, inp.row, a.kind);
    inp.input(2, inp.row, a.description);
    inp.input(3, inp.row, a.amount, FMT.egp);
    inp.row++;
  });
  const abLast = inp.row - 1;
  inp.blank();

  // Bridge
  inp.section("Debt, cash and deposits");
  inp.header(["Kind", "Description", "Balance", "Currency"]);
  const brFirst = inp.row;
  input.bridge.forEach((b) => {
    inp.input(1, inp.row, b.kind);
    inp.input(2, inp.row, b.description);
    inp.input(3, inp.row, b.balance, FMT.egp);
    inp.input(4, inp.row, b.currency);
    inp.row++;
  });
  const brLast = inp.row - 1;
  inp.blank();

  // Assumptions table (filled after derivation cells exist; reserve rows now)
  inp.section("Assumptions");
  const aHdr = inp.header(["Key", "Assumption", "Value", "Unit", "Origin", "Confirmed", "Source", "As of", "Stale"]);
  const aRow: Record<string, number> = {};
  CATALOGUE.forEach((e, i) => (aRow[e.key] = aHdr + 1 + i));
  inp.row = aHdr + 1 + CATALOGUE.length + 1;
  inp.freeze(3, 1);
  for (const e of CATALOGUE) wb.definedNames.add(abs("Inputs", 3, aRow[e.key]!), nm(e.key));
  const resolved = Object.fromEntries(result.assumptions.map((a) => [a.key, a])) as Record<string, ResolvedAssumption>;
  /** Formulas for derived assumptions, set by the sheets that compute them. */
  const derivedFormula: Record<string, string> = {};

  /* ---------------- Normalization ---------------- */
  nor.title("Normalization", "Trailing twelve months. Reported EBITDA to SDE and normalized EBITDA.");
  nor.header(["Line", "EGP", "Basis"]);
  nor.freeze(4, 1);
  const nrow = (label: string, formula: string, basis: string, bold = false, fmt = FMT.egp) => {
    nor.label(1, nor.row, label, { bold, indent: bold ? 0 : 1 });
    const ref = nor.f(2, nor.row, formula, fmt, bold);
    nor.label(3, nor.row, basis, { italic: true });
    nor.row++;
    return ref;
  };
  const revCh = CHANNELS.map((c, i) => nrow(`Revenue: ${c.replace("_", "-")}`, `=SUM(${ucol(4 + i)})`, "Sum of units"));
  const revenue = nrow("Revenue", `=${revCh.join("+")}`, "", true);
  wb.definedNames.add(revenue, "N_Revenue");
  const costRefs = UNIT_COST_LINES.map((l, i) => nrow(`Cost: ${l.replace(/_/g, " ")}`, `=SUM(${ucol(8 + i)})`, "Sum of units"));
  const ho = nrow("Cost: head office", "=I_HeadOffice", "Inputs");
  const totalCosts = nrow("Total operating costs", `=${[...costRefs, ho].join("+")}`, "", true);
  const reported = nrow("Reported EBITDA", `=${revenue}-${totalCosts}`, "", true);
  nrow("Reported EBITDA margin", `=IF(${revenue}=0,0,${reported}/${revenue})`, "", false, FMT.pct);
  nor.blank();
  const addbacks = nrow(
    "Add-backs (owner pay, one-offs, related party, non-operating)",
    abLast >= abFirst ? `=SUM(Inputs!$C$${abFirst}:$C$${abLast})` : "=0",
    "Inputs: add-backs table",
  );
  const sde = nrow("Seller's discretionary earnings (SDE)", `=${reported}+${addbacks}`, "", true);
  wb.definedNames.add(sde, "N_SDE");
  const mgr = nrow("Less: market-rate manager", `=${nm("norm.market_manager_salary")}`, "Assumption (sourced)");
  const normE = nrow("Normalized EBITDA", `=${sde}-${mgr}`, "", true);
  wb.definedNames.add(normE, "N_NormEbitda");
  const normM = nrow("Normalized EBITDA margin", `=IF(${revenue}=0,0,${normE}/${revenue})`, "", true, FMT.pct);
  wb.definedNames.add(normM, "N_NormMargin");
  Object.assign(checks, {
    "normalization.revenue": revenue,
    "normalization.reportedEbitda": reported,
    "normalization.sde": sde,
    "normalization.normalizedEbitda": normE,
  });

  /* ---------------- Unit Economics ---------------- */
  ue.title("Unit Economics", "TTM per unit. Four-wall EBITDA excludes head-office costs.");
  const ueHdr = ue.header([
    "Unit",
    "Months open",
    "TTM months",
    "Sales",
    "Annualised sales",
    "COGS",
    "Labour",
    "Prime cost %",
    "Rent",
    "Rent %",
    "Other costs",
    "Four-wall EBITDA",
    "Margin",
    "Investment",
    "Payback (yrs)",
    "Mature",
    "Obs. ramp Y1",
  ]);
  ue.freeze(ueHdr, 1);
  const ueFirst = ue.row;
  input.units.forEach((u, i) => {
    const r = ue.row;
    const ir = uFirst + i;
    const mr = mFirst + i;
    ue.f(1, r, `=${ucell(1, ir)}`);
    ue.f(2, r, `=IF(${ucell(2, ir)}="","",(YEAR(I_ValDate)-YEAR(${ucell(2, ir)}))*12+MONTH(I_ValDate)-MONTH(${ucell(2, ir)}))`, FMT.int);
    ue.f(3, r, `=${ucell(3, ir)}`, FMT.int);
    ue.f(4, r, `=SUM(${ucell(4, ir)}:${ucell(7, ir).split("!")[1]})`, FMT.egp0);
    ue.f(5, r, `=IF(C${r}>0,D${r}*12/C${r},0)`, FMT.egp0);
    ue.f(6, r, `=${ucell(8, ir)}`, FMT.egp0);
    ue.f(7, r, `=${ucell(9, ir)}`, FMT.egp0);
    ue.f(8, r, `=IF(D${r}=0,0,(F${r}+G${r})/D${r})`, FMT.pct);
    ue.f(9, r, `=${ucell(10, ir)}`, FMT.egp0);
    ue.f(10, r, `=IF(D${r}=0,0,I${r}/D${r})`, FMT.pct);
    ue.f(11, r, `=SUM(${ucell(8, ir)}:${ucell(15, ir).split("!")[1]})-F${r}-G${r}-I${r}`, FMT.egp0);
    ue.f(12, r, `=D${r}-SUM(${ucell(8, ir)}:${ucell(15, ir).split("!")[1]})`, FMT.egp0);
    ue.f(13, r, `=IF(D${r}=0,0,L${r}/D${r})`, FMT.pct);
    ue.f(14, r, `=SUM(${ucell(16, ir)}:${ucell(19, ir).split("!")[1]})`, FMT.egp0);
    ue.f(15, r, `=IF(AND(N${r}>0,C${r}>0,L${r}>0),N${r}/(L${r}*12/C${r}),"n/a")`, FMT.num);
    ue.f(16, r, `=AND(ISNUMBER(B${r}),B${r}>=24,C${r}=12)`);
    const row = `Inputs!$B$${mr}:$${colL(1 + Math.max(1, maxIdx))}$${mr}`;
    const m1 = `Inputs!$B$${mr}:$M$${mr}`;
    ue.f(
      17,
      r,
      `=IF(AND(COUNT(${row})>=15,COUNT(${m1})=12,COUNT(${row})=IFERROR(MATCH(9.9E+307,${row}),0)),AVERAGE(${m1})/AVERAGE(OFFSET(Inputs!$B$${mr},0,COUNT(${row})-3,1,3)),"")`,
      FMT.pct,
    );
    checks[`unitEconomics.rows.${i}.fourWallEbitda`] = ue.ref(12, r);
    ue.row++;
  });
  const ueLast = Math.max(ueFirst, ue.row - 1);
  const uec = (c: number) => `'Unit Economics'!$${colL(c)}$${ueFirst}:$${colL(c)}$${ueLast}`;
  ue.label(1, ue.row, "Total", { bold: true });
  ue.f(4, ue.row, `=SUM(${uec(4)})`, FMT.egp0, true);
  ue.f(12, ue.row, `=SUM(${uec(12)})`, FMT.egp0, true);
  ue.f(13, ue.row, `=IF(D${ue.row}=0,0,L${ue.row}/D${ue.row})`, FMT.pct, true);
  ue.f(14, ue.row, `=SUM(${uec(14)})`, FMT.egp0, true);
  ue.row += 2;
  ue.section("New-unit template (derivations)");
  const uk = (label: string, formula: string, fmt: string) => {
    ue.label(1, ue.row, label);
    const ref = ue.f(4, ue.row, formula, fmt);
    ue.row++;
    return ref;
  };
  derivedFormula["unit.new_unit_mature_sales"] = uk(
    "Average annualised sales of mature units (all units if none mature)",
    `=IF(COUNTIF(${uec(16)},TRUE)>0,AVERAGEIF(${uec(16)},TRUE,${uec(5)}),AVERAGE(${uec(5)}))`,
    FMT.egp,
  );
  derivedFormula["unit.new_unit_capex"] = uk("Average capex per unit with capex recorded", `=AVERAGEIF(${uec(14)},">0")`, FMT.egp);
  derivedFormula["unit.ramp_y1"] = uk("Observed year-1 ramp (average)", `=IFERROR(AVERAGE(${uec(17)}),"")`, FMT.pct);
  uk("New-unit four-wall margin (mature average)", `=IF(COUNTIF(${uec(16)},TRUE)>0,AVERAGEIF(${uec(16)},TRUE,${uec(13)}),AVERAGE(${uec(13)}))`, FMT.pct);

  /* ---------------- Multiples ---------------- */
  mu.title("Multiples", "Comparables are inputs with a cited source. Excluded rows do not enter the statistics.");
  const muHdr = mu.header(["Comparable", "Type", "Country", "Date", "EV/EBITDA", "EV/Revenue", "Price/SDE", "Included", "Source", "EBITDA x", "Rev x", "SDE x"]);
  mu.freeze(muHdr, 1);
  const cFirst = mu.row;
  input.comparables.forEach((c) => {
    const r = mu.row;
    mu.input(1, r, c.name);
    mu.input(2, r, c.kind);
    mu.input(3, r, c.country);
    mu.input(4, r, c.date ? new Date(c.date + "T00:00:00Z") : null, FMT.date);
    mu.input(5, r, c.evToEbitda, FMT.x);
    mu.input(6, r, c.evToRevenue, FMT.x);
    mu.input(7, r, c.priceToSde, FMT.x);
    mu.input(8, r, c.included && !!c.sourceId);
    const s = sourceTitle.get(c.sourceId);
    mu.input(9, r, s ? `${s.title}${s.publishedDate ? ` (${s.publishedDate})` : ""}` : c.sourceId);
    [5, 6, 7].forEach((col, k) => mu.f(10 + k, r, `=IF(AND($H${r},ISNUMBER(${colL(col)}${r})),${colL(col)}${r},"")`, FMT.x));
    mu.row++;
  });
  const cLast = Math.max(cFirst, mu.row - 1);
  mu.blank();
  mu.section("Statistics and implied enterprise value");
  const stHdr = mu.header(["Metric", "Count", "Q1", "Median", "Q3", "Selected", "Earnings base", "Usable", "Weight", "Low", "Mid", "High"]);
  const metrics = [
    { key: "ev_ebitda", label: "EV / normalized EBITDA", hc: 10, base: "N_NormEbitda", sel: "mult.selected_ev_ebitda", w: "mult.w_ebitda" },
    { key: "ev_revenue", label: "EV / revenue", hc: 11, base: "N_Revenue", sel: "mult.selected_ev_revenue", w: "mult.w_revenue" },
    { key: "price_sde", label: "Price / SDE", hc: 12, base: "N_SDE", sel: "mult.selected_price_sde", w: "mult.w_sde" },
  ];
  const mRows: number[] = [];
  metrics.forEach((m) => {
    const r = mu.row;
    mRows.push(r);
    const rng = `$${colL(m.hc)}$${cFirst}:$${colL(m.hc)}$${cLast}`;
    mu.label(1, r, m.label);
    mu.f(2, r, `=COUNT(${rng})`, FMT.int);
    mu.f(3, r, `=IF(B${r}>0,_xlfn.QUARTILE.INC(${rng},1),"")`, FMT.x);
    mu.f(4, r, `=IF(B${r}>0,MEDIAN(${rng}),"")`, FMT.x);
    mu.f(5, r, `=IF(B${r}>0,_xlfn.QUARTILE.INC(${rng},3),"")`, FMT.x);
    derivedFormula[m.sel] = mu.ref(4, r);
    mu.f(6, r, `=${nm(m.sel)}`, FMT.x);
    mu.f(7, r, `=${m.base}`, FMT.egp);
    mu.f(8, r, `=AND(B${r}>0,G${r}>0,ISNUMBER(F${r}))`);
    mu.f(9, r, `=IF(H${r},${nm(m.w)},0)`, FMT.pct);
    mu.f(10, r, `=IF(H${r},G${r}*C${r},0)`, FMT.egp0);
    mu.f(11, r, `=IF(H${r},G${r}*F${r},0)`, FMT.egp0);
    mu.f(12, r, `=IF(H${r},G${r}*E${r},0)`, FMT.egp0);
    mu.row++;
  });
  derivedFormula["dcf.exit_multiple"] = mu.ref(4, mRows[0]!);
  void stHdr;
  const tw = mu.ref(9, mu.row);
  mu.label(1, mu.row, "Total weight");
  mu.f(9, mu.row, `=${mRows.map((r) => `I${r}`).join("+")}`, FMT.pct);
  mu.row++;
  const mAgg = (col: number) => `=IF(${tw}>0,${mRows.map((r) => `(I${r}/${tw})*${colL(col)}${r}`).join("+")},0)`;
  mu.label(1, mu.row, "Weighted enterprise value", { bold: true });
  const mLow = mu.f(10, mu.row, mAgg(10), FMT.egp0, true);
  const mMid = mu.f(11, mu.row, mAgg(11), FMT.egp0, true);
  const mHigh = mu.f(12, mu.row, mAgg(12), FMT.egp0, true);
  mu.row++;
  Object.assign(checks, { "multiples.low": mLow, "multiples.mid": mMid, "multiples.high": mHigh });

  /* ---------------- Adjustments (derivations needed by Inputs) ---------------- */
  adj.title("Adjustments", "Discounts applied to equity value. Suggested values follow the rules shown; the applied value is an assumption.");
  adj.header(["Adjustment", "Applied", "Suggested", "Basis"]);
  adj.freeze(4, 1);
  const salesRng = uec(4);
  const leaseRng = ucol(20);
  const wYears = `IFERROR(SUMPRODUCT(${salesRng},${leaseRng})/SUMPRODUCT(${salesRng},--(${leaseRng}<>"")),"")`;
  const delivShare = `IF(N_Revenue=0,0,SUM(${ucol(5)})/N_Revenue)`;
  const sugg: Record<string, string> = {
    "adj.dlom": "=0.2",
    "adj.key_person": `=IF(I_OwnerDep="","",(MIN(5,MAX(1,ROUND(I_OwnerDep,0)))-1)*0.025)`,
    "adj.lease_risk": `=IF(${wYears}="","",IF(${wYears}<2,0.075,IF(${wYears}<4,0.04,IF(${wYears}<6,0.02,0))))`,
    "adj.delivery": `=IF(${delivShare}>0.5,0.075,IF(${delivShare}>0.35,0.05,IF(${delivShare}>0.2,0.025,0)))`,
    "adj.fx": `=IF(I_ImportShare="","",IF(I_ImportShare>0.6,0.04,IF(I_ImportShare>0.3,0.02,IF(I_ImportShare>0,0.01,0))))`,
  };
  const adjRefs: string[] = [];
  result.adjustments.rows.forEach((a) => {
    const r = adj.row;
    adj.label(1, r, a.label);
    adjRefs.push(adj.f(2, r, `=${nm(a.key)}`, FMT.pct));
    const sref = adj.f(3, r, sugg[a.key]!, FMT.pct);
    if (a.key !== "adj.dlom") derivedFormula[a.key] = sref;
    adj.label(4, r, a.rationale, { italic: true });
    adj.row++;
  });
  adj.blank();
  adj.label(1, adj.row, "Combined factor (product of 1 - discount)", { bold: true });
  const factor = adj.f(2, adj.row, `=${adjRefs.map((r) => `(1-${r})`).join("*")}`, FMT.factor, true);
  adj.row++;
  adj.label(1, adj.row, "Combined discount");
  adj.f(2, adj.row, `=1-${factor}`, FMT.pct);
  adj.row++;
  checks["adjustments.combinedFactor"] = factor;

  // Derived growth-plan and reconciliation-weight formulas
  for (const s of SCENARIOS)
    for (let y = 1; y <= 5; y++)
      derivedFormula[`dcf.${s}.new_units_y${y}`] = s === "downside" ? `INT(I_Plan_y${y}/2)` : `I_Plan_y${y}`;
  derivedFormula["rec.w_dcf"] = "IF(I_Months<36,0.7,0.5)";
  derivedFormula["rec.w_multiples"] = "IF(I_Months<36,0.3,0.5)";
  derivedFormula["rec.w_asset"] = "0";

  /* Now fill the Inputs assumptions table */
  for (const e of CATALOGUE) {
    const r = aRow[e.key]!;
    const a = resolved[e.key]!;
    inp.label(1, r, e.key);
    inp.label(2, r, e.label);
    if (a.origin === "derived" && derivedFormula[e.key]) {
      inp.f(3, r, `=${derivedFormula[e.key]!.replace(/^=/, "")}`, unitFmt(e.unit));
    } else {
      inp.input(3, r, a.value, unitFmt(e.unit));
    }
    inp.label(4, r, e.unit);
    inp.label(5, r, a.origin);
    inp.label(6, r, a.confirmed ? "yes" : "no");
    const s = a.sourceId ? sourceTitle.get(a.sourceId) : undefined;
    inp.label(7, r, s ? s.title : a.requiresSource ? "NO SOURCE" : "");
    inp.label(8, r, a.asOf ?? "");
    inp.label(9, r, a.stale ? "STALE" : "");
    if (a.value === null) {
      const c = inp.ws.getCell(r, 3);
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
    }
  }

  /* ---------------- DCF: discount rate ---------------- */
  dcfS.title("DCF", "Discount rate build-up, scenario values and USD cross-check.");
  dcfS.freeze(3, 1);
  dcfS.section("Cost of equity (USD build-up)");
  const comp = [
    ["US risk-free rate", "macro.us_rf"],
    ["Equity risk premium", "macro.erp"],
    ["Egypt country risk premium", "macro.crp_egypt"],
    ["Size premium", "dr.size_premium"],
    ["Company-specific premium", "dr.csrp"],
  ];
  const compRefs = comp.map(([l, k]) => {
    dcfS.label(1, dcfS.row, l!, { indent: 1 });
    const ref = dcfS.f(2, dcfS.row, `=${nm(k!)}`, FMT.pct);
    dcfS.row++;
    return ref;
  });
  dcfS.label(1, dcfS.row, "Cost of equity, USD", { bold: true });
  const keUsd = dcfS.f(2, dcfS.row, `=${compRefs.join("+")}`, FMT.pct, true);
  dcfS.row++;
  dcfS.label(1, dcfS.row, "EGP T-bill build-up (alternative method)", { indent: 1 });
  const keTbill = dcfS.f(
    2,
    dcfS.row,
    `=${nm("macro.egp_tbill")}+${nm("macro.erp")}+${nm("macro.crp_egypt")}+${nm("dr.size_premium")}+${nm("dr.csrp")}`,
    FMT.pct,
  );
  dcfS.row++;
  dcfS.label(1, dcfS.row, "Method in use");
  dcfS.f(2, dcfS.row, "=I_DrMethod");
  dcfS.row++;
  if (input.meta.discountRateMethod === "egp_tbill") {
    dcfS.label(1, dcfS.row, "Warning: the EGP T-bill already prices Egypt sovereign risk; adding the CRP may double-count it.", { italic: true });
    dcfS.row++;
  }
  dcfS.blank();
  dcfS.section("Nominal EGP discount rate by year");
  dcfS.header(["", "Terminal", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"]);
  const wd = nm("dr.debt_weight");
  const kdAt = `(${nm("dr.kd_egp")}*(1-${nm("macro.tax_rate")}))`;
  const keRow = dcfS.row;
  dcfS.label(1, keRow, "Cost of equity, EGP");
  const keFor = (pi: string) => `=IF(I_DrMethod="egp_tbill",${keTbill},(1+${keUsd})*(1+${pi})/(1+${nm("macro.usd_inflation")})-1)`;
  dcfS.f(2, keRow, keFor(nm("macro.egp_inflation_lt")), FMT.pct);
  for (let y = 1; y <= 5; y++) dcfS.f(2 + y, keRow, keFor(nm(`macro.egp_inflation_y${y}`)), FMT.pct);
  dcfS.row++;
  const waccRow = dcfS.row;
  dcfS.label(1, waccRow, "WACC, EGP (nominal)", { bold: true });
  for (let c = 2; c <= 7; c++) dcfS.f(c, waccRow, `=(1-${wd})*${colL(c)}${keRow}+${wd}*${kdAt}`, FMT.pct, true);
  dcfS.row++;
  const rates = [1, 2, 3, 4, 5].map((y) => dcfS.ref(2 + y, waccRow));
  const rateT = dcfS.ref(2, waccRow);
  wb.definedNames.add(rateT, "D_RateTerminal");
  dcfS.label(1, dcfS.row, "WACC, USD (cross-check)");
  const waccUsd = dcfS.f(2, dcfS.row, `=(1+${rateT})*(1+${nm("macro.usd_inflation")})/(1+${nm("macro.egp_inflation_lt")})-1`, FMT.pct);
  dcfS.row += 2;
  rates.forEach((r, i) => (checks[`discountRate.waccEgp.${i}`] = r));
  checks["discountRate.waccEgpTerminal"] = rateT;

  /* ---------------- Forecast ---------------- */
  fc.title("Forecast", "Five-year forecast in nominal EGP. Mid-year discounting. Units open at the start of the year.");
  fc.freeze(3, 1);
  const baseParams = (s: string): BlockParams => ({
    baseRevenue: "N_Revenue",
    baseMargin: "N_NormMargin",
    inflation: [1, 2, 3, 4, 5].map((y) => nm(`macro.egp_inflation_y${y}`)),
    sssReal: nm(`dcf.${s}.sss_real`),
    marginDelta: nm(`dcf.${s}.margin_delta`),
    marginShift: "0",
    newUnits: [1, 2, 3, 4, 5].map((y) => nm(`dcf.${s}.new_units_y${y}`)),
    matureSales: nm("unit.new_unit_mature_sales"),
    capexPerUnit: nm("unit.new_unit_capex"),
    rampY1: nm("unit.ramp_y1"),
    rampY2: nm("unit.ramp_y2"),
    daPct: nm("dcf.da_pct"),
    maintCapexPct: nm("dcf.maint_capex_pct"),
    nwcPct: nm("dcf.nwc_pct"),
    taxRate: nm("macro.tax_rate"),
    rates,
    terminalRate: rateT,
    gRealLt: nm("dcf.g_real_lt"),
    inflationLt: nm("macro.egp_inflation_lt"),
    exitMultiple: nm("dcf.exit_multiple"),
    tvWeightGordon: nm("dcf.tv_weight_gordon"),
  });
  const blocks: Record<string, BlockRefs> = {};
  for (const s of SCENARIOS) {
    blocks[s] = forecastBlock(fc, `${s.charAt(0).toUpperCase() + s.slice(1)} scenario`, baseParams(s));
    checks[`dcf.scenarios.${s}.ev`] = blocks[s]!.ev;
    checks[`dcf.scenarios.${s}.sumPv`] = blocks[s]!.sumPv;
    blocks[s]!.fcff.forEach((r, i) => (checks[`dcf.scenarios.${s}.years.${i}.fcff`] = r));
  }

  /* ---------------- DCF: scenarios and USD cross-check ---------------- */
  dcfS.section("Scenario values");
  dcfS.header(["Scenario", "Probability", "EV (blended)", "TV Gordon", "TV exit", "Sum PV"]);
  const pRefs: string[] = [];
  const evRefs: string[] = [];
  for (const s of SCENARIOS) {
    const r = dcfS.row;
    dcfS.label(1, r, s.charAt(0).toUpperCase() + s.slice(1));
    pRefs.push(dcfS.f(2, r, `=${nm(`dcf.p_${s}`)}`, FMT.pct));
    evRefs.push(dcfS.f(3, r, `=${blocks[s]!.ev}`, FMT.egp));
    dcfS.f(4, r, `=${blocks[s]!.tvGordon}`, FMT.egp);
    dcfS.f(5, r, `=${blocks[s]!.tvExit}`, FMT.egp);
    dcfS.f(6, r, `=${blocks[s]!.sumPv}`, FMT.egp);
    dcfS.row++;
  }
  dcfS.label(1, dcfS.row, "Probability-weighted DCF enterprise value", { bold: true });
  const dcfW = dcfS.f(3, dcfS.row, `=${pRefs.map((p, i) => `${p}*${evRefs[i]}`).join("+")}`, FMT.egp, true);
  dcfS.row += 2;
  checks["dcf.weightedEv"] = dcfW;

  dcfS.section("USD cross-check (base scenario)");
  dcfS.header(["", "", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"]);
  const fxRow = dcfS.row;
  const fxForecast = [1, 2, 3, 4, 5].map((y) => nm(`macro.fx_forecast_y${y}`));
  const useFc = `COUNT(${fxForecast.join(",")})=5`;
  dcfS.label(1, fxRow, "USD/EGP (forecast if all five given, else relative PPP)");
  for (let y = 1; y <= 5; y++)
    dcfS.f(2 + y, fxRow, `=IF(${useFc},${fxForecast[y - 1]},${nm("macro.fx_usd_egp")}*${blocks.base!.priceIndex[y - 1]}/(1+${nm("macro.usd_inflation")})^${y})`, FMT.fx);
  dcfS.row++;
  const fcUsdRow = dcfS.row;
  dcfS.label(1, fcUsdRow, "FCFF, USD");
  for (let y = 1; y <= 5; y++) dcfS.f(2 + y, fcUsdRow, `=${blocks.base!.fcff[y - 1]}/${colL(2 + y)}${fxRow}`, FMT.egp);
  dcfS.row++;
  const pvUsdRow = dcfS.row;
  dcfS.label(1, pvUsdRow, "PV, USD (mid-year)");
  for (let y = 1; y <= 5; y++) dcfS.f(2 + y, pvUsdRow, `=${colL(2 + y)}${fcUsdRow}/(1+${waccUsd})^(${y}-0.5)`, FMT.egp);
  dcfS.row++;
  dcfS.label(1, dcfS.row, "Enterprise value, USD");
  const tvBlend = `(${nm("dcf.tv_weight_gordon")}*${blocks.base!.tvGordon}+(1-${nm("dcf.tv_weight_gordon")})*${blocks.base!.tvExit})`;
  const evUsd = dcfS.f(3, dcfS.row, `=SUM(C${pvUsdRow}:G${pvUsdRow})+${tvBlend}/G${fxRow}/(1+${waccUsd})^5`, FMT.egp, true);
  dcfS.row++;
  dcfS.label(1, dcfS.row, "USD value translated at spot, EGP");
  const evUsdEgp = dcfS.f(3, dcfS.row, `=${evUsd}*${nm("macro.fx_usd_egp")}`, FMT.egp);
  dcfS.row++;
  dcfS.label(1, dcfS.row, "Difference vs EGP base-scenario EV");
  dcfS.f(3, dcfS.row, `=IF(${blocks.base!.ev}=0,0,${evUsdEgp}/${blocks.base!.ev}-1)`, FMT.pct);
  dcfS.row++;
  checks["dcf.usdCrossCheck.evUsd"] = evUsd;

  /* ---------------- Asset Floor ---------------- */
  af.title("Asset Floor", "Orderly-liquidation value of equipment, fit-out and inventory.");
  af.header(["Category", "Cost", "Resale %", "Value"]);
  af.freeze(4, 1);
  const cats = [
    ["Equipment", 17, "asset.resale_equipment"],
    ["Fit-out", 16, "asset.resale_fit_out"],
    ["Furniture", 18, "asset.resale_furniture"],
    ["Other", 19, "asset.resale_other"],
  ] as const;
  const afVals: string[] = [];
  for (const [l, col, k] of cats) {
    const r = af.row;
    af.label(1, r, l);
    af.f(2, r, `=SUM(${ucol(col)})`, FMT.egp);
    af.f(3, r, `=${nm(k)}`, FMT.pct);
    afVals.push(af.f(4, r, `=B${r}*C${r}`, FMT.egp));
    af.row++;
  }
  const ir = af.row;
  af.label(1, ir, "Inventory");
  af.f(2, ir, "=I_Inventory", FMT.egp);
  af.f(3, ir, `=${nm("asset.inventory_recovery")}`, FMT.pct);
  af.f(4, ir, `=B${ir}*C${ir}`, FMT.egp);
  af.row++;
  af.label(1, af.row, "Gross recoverable value", { bold: true });
  const gross = af.f(4, af.row, `=${[...afVals, `D${ir}`].join("+")}`, FMT.egp, true);
  af.row++;
  af.label(1, af.row, "Less: liquidation costs");
  af.f(3, af.row, `=${nm("asset.liquidation_cost")}`, FMT.pct);
  const liq = af.f(4, af.row, `=${gross}*C${af.row}`, FMT.egp);
  af.row++;
  af.label(1, af.row, "Asset-based floor", { bold: true });
  const floor = af.f(4, af.row, `=${gross}-${liq}`, FMT.egp, true);
  af.row++;
  checks["assetFloor.floor"] = floor;

  /* ---------------- Reconciliation ---------------- */
  rec.title("Reconciliation", "Weighted enterprise value, floor test, equity bridge and adjustments.");
  rec.freeze(3, 1);
  // DCF availability (mirrors engine rule)
  const req = [
    "macro.us_rf",
    "macro.erp",
    "macro.crp_egypt",
    ...[1, 2, 3, 4, 5].map((y) => `macro.egp_inflation_y${y}`),
    "macro.egp_inflation_lt",
    "macro.usd_inflation",
    "macro.tax_rate",
    "macro.fx_usd_egp",
    "dr.size_premium",
    "norm.market_manager_salary",
    "dcf.exit_multiple",
  ];
  if (input.meta.discountRateMethod === "egp_tbill") req.push("macro.egp_tbill");
  rec.section("Method availability");
  rec.label(1, rec.row, "DCF available (all required inputs present, rate > growth)");
  const dcfAvail = rec.f(
    2,
    rec.row,
    `=AND(COUNT(${req.map(nm).join(",")})=${req.length},N_Revenue>0,D_RateTerminal>${blocks.base!.terminalGrowth})`,
  );
  rec.row++;
  rec.label(1, rec.row, "Multiples available (usable weight > 0)");
  const multAvail = rec.f(2, rec.row, `=${tw}>0`);
  rec.row += 2;

  rec.section("Methods");
  const mHdr = rec.header(["Method", "Low", "Mid", "High", "Weight", "Note"]);
  const methodRows: number[] = [];
  const addMethod = (label: string, avail: string, low: string, mid: string, high: string, w: string, note: string) => {
    const r = rec.row;
    methodRows.push(r);
    rec.label(1, r, label);
    rec.f(2, r, `=IF(${avail},${low},0)`, FMT.egp0);
    rec.f(3, r, `=IF(${avail},${mid},0)`, FMT.egp0);
    rec.f(4, r, `=IF(${avail},${high},0)`, FMT.egp0);
    rec.f(7, r, `=IF(${avail},${w},0)`, FMT.pct); // raw weight (helper)
    rec.label(6, r, note, { italic: true });
    rec.row++;
  };
  addMethod("Discounted cash flow", dcfAvail, blocks.downside!.ev, dcfW, blocks.upside!.ev, nm("rec.w_dcf"), "Low = downside, mid = probability-weighted, high = upside");
  addMethod("Market multiples", multAvail, mLow, mMid, mHigh, nm("rec.w_multiples"), "Low = Q1, mid = selected, high = Q3");
  addMethod("Asset-based floor", "TRUE", floor, floor, floor, nm("rec.w_asset"), "Orderly liquidation");
  rec.ws.getCell(mHdr, 7).value = "Raw weight";
  const twRec = `(${methodRows.map((r) => `G${r}`).join("+")})`;
  for (const r of methodRows) rec.f(5, r, `=IF(${twRec}>0,G${r}/${twRec},0)`, FMT.pct);
  rec.label(1, rec.row, result.reconciliation.weightsRationale, { italic: true });
  rec.row += 2;

  const agg = (col: string) => `=${methodRows.map((r) => `E${r}*${col}${r}`).join("+")}`;
  rec.header(["", "Low", "Mid", "High"]);
  const line = (label: string, fs: [string, string, string], fmt = FMT.egp, bold = false) => {
    const r = rec.row;
    rec.label(1, r, label, { bold });
    const refs = fs.map((f, i) => rec.f(2 + i, r, f, fmt, bold));
    rec.row++;
    return { r, refs };
  };
  const raw = line("Weighted enterprise value (before floor)", [agg("B"), agg("C"), agg("D")]);
  const ev = line("Enterprise value (floored at asset value)", [0, 1, 2].map((i) => `=MAX(${raw.refs[i]},${floor})`) as [string, string, string], FMT.egp, true);
  rec.blank();
  rec.section("Equity bridge");
  rec.header(["Item", "Balance", "Currency", "EGP", "Sign"]);
  const bRows: number[] = [];
  for (let r0 = brFirst; r0 <= brLast; r0++) {
    const r = rec.row;
    bRows.push(r);
    rec.f(1, r, `=Inputs!$B$${r0}&" ("&Inputs!$A$${r0}&")"`);
    rec.f(2, r, `=Inputs!$C$${r0}`, FMT.egp);
    rec.f(3, r, `=Inputs!$D$${r0}`);
    rec.f(4, r, `=IF(C${r}="USD",B${r}*${nm("macro.fx_usd_egp")},B${r})`, FMT.egp);
    rec.f(5, r, `=IF(Inputs!$A$${r0}="lease_liability",0,IF(OR(Inputs!$A$${r0}="cash",Inputs!$A$${r0}="deposit_paid"),1,-1))`, FMT.int);
    rec.row++;
  }
  rec.label(1, rec.row, "Net debt adjustment (lease liabilities excluded: rent is in EBITDA)", { bold: true });
  const net = rec.f(4, rec.row, bRows.length ? `=${bRows.map((r) => `E${r}*D${r}`).join("+")}` : "=0", FMT.egp, true);
  rec.row += 2;
  checks["bridge.netAdjustment"] = net;
  rec.header(["", "Low", "Mid", "High"]);
  const eq = line("Equity value", [0, 1, 2].map((i) => `=${ev.refs[i]}+${net}`) as [string, string, string]);
  const ad = line("After adjustments", [0, 1, 2].map((i) => `=${eq.refs[i]}*${factor}`) as [string, string, string]);
  const rd = nm("rec.rounding");
  const rnd = line(
    "Value range (rounded)",
    [0, 1, 2].map((i) => `=IF(${rd}=0,${ad.refs[i]},ROUND(${ad.refs[i]}/${rd},0)*${rd})`) as [string, string, string],
    FMT.egp0,
    true,
  );
  line("Value range, USD at spot", [0, 1, 2].map((i) => `=IF(${nm("macro.fx_usd_egp")}>0,${rnd.refs[i]}/${nm("macro.fx_usd_egp")},0)`) as [string, string, string], FMT.egp0);
  ["Low", "Mid", "High"].forEach((k, i) => {
    checks[`reconciliation.ev${k}`] = ev.refs[i]!;
    checks[`reconciliation.adjusted${k}`] = ad.refs[i]!;
    checks[`reconciliation.rounded${k}`] = rnd.refs[i]!;
  });
  rec.blank();
  rec.section("Football field (chart data)");
  rec.header(["Method", "Low", "High", "Weight"]);
  methodRows.forEach((r) => {
    const rr = rec.row;
    rec.f(1, rr, `=A${r}`);
    rec.f(2, rr, `=B${r}`, FMT.egp0);
    rec.f(3, rr, `=D${r}`, FMT.egp0);
    rec.f(4, rr, `=E${r}`, FMT.pct);
    rec.row++;
  });
  rec.f(1, rec.row, `="Concluded range"`);
  rec.f(2, rec.row, `=${rnd.refs[0]}`, FMT.egp0);
  rec.f(3, rec.row, `=${rnd.refs[2]}`, FMT.egp0);
  rec.row++;

  /* ---------------- Sensitivities ---------------- */
  sen.title("Sensitivities", "Base-scenario enterprise value (EGP). Each cell is recomputed in full in the workings below.");
  sen.freeze(3, 1);
  const grids = [
    { key: "rate_growth", title: "Discount rate (rows) vs terminal real growth (columns)", rows: SENS_RATE, cols: SENS_GROWTH, rf: FMT.pct, cf: FMT.pct },
    { key: "margin_sss", title: "EBITDA margin shift (rows) vs real same-store sales shift (columns)", rows: SENS_MARGIN, cols: SENS_SSS, rf: FMT.pct, cf: FMT.pct },
    { key: "units_capex", title: "New units per year change (rows) vs capex per unit change (columns)", rows: SENS_UNITS, cols: SENS_CAPEX, rf: '+0;-0;0', cf: FMT.pct },
  ];
  const gridPos: { key: string; top: number; rowRefs: string[]; colRefs: string[]; cellRow: number }[] = [];
  for (const g of grids) {
    sen.section(g.title);
    const top = sen.row;
    sen.label(1, top, "Shift");
    const colRefs = g.cols.map((c, j) => sen.input(2 + j, top, c, g.cf));
    sen.row++;
    const rowRefs: string[] = [];
    g.rows.forEach((rv) => {
      rowRefs.push(sen.input(1, sen.row, rv, g.rf));
      sen.row++;
    });
    gridPos.push({ key: g.key, top, rowRefs, colRefs, cellRow: top + 1 });
    sen.label(1, sen.row, "Check: centre cell less base EV (should be 0.00)", { italic: true });
    sen.f(2, sen.row, `=${colL(4)}${top + 3}-${blocks.base!.ev}`, FMT.egp);
    sen.row += 2;
  }
  sen.section("Workings");
  const wStart = sen.row;
  const bp = baseParams("base");
  for (const [gi, g] of grids.entries()) {
    const pos = gridPos[gi]!;
    g.rows.forEach((_, i) => {
      g.cols.forEach((__, j) => {
        const rr = pos.rowRefs[i]!;
        const cc = pos.colRefs[j]!;
        const p: BlockParams = { ...bp };
        if (g.key === "rate_growth") {
          p.rates = bp.rates.map((x) => `(${x}+${rr})`);
          p.terminalRate = `(${bp.terminalRate}+${rr})`;
          p.gRealLt = `(${bp.gRealLt}+${cc})`;
        } else if (g.key === "margin_sss") {
          p.marginShift = rr;
          p.sssReal = `(${bp.sssReal}+${cc})`;
        } else {
          p.newUnits = bp.newUnits.map((n) => `MAX(0,${n}+${rr})`);
          p.capexPerUnit = `(${bp.capexPerUnit}*(1+${cc}))`;
        }
        const b = forecastBlock(sen, `${g.key}: row ${i + 1}, column ${j + 1}`, p);
        const c = sen.ws.getCell(pos.cellRow + i, 2 + j);
        c.value = { formula: b.ev } as ExcelJS.CellFormulaValue;
        c.numFmt = FMT.egp0;
        c.font = { name: "Calibri", size: 10, color: { argb: BLACK }, bold: i === 2 && j === 2 };
        checks[`sensitivities.${gi}.values.${i}.${j}`] = abs("Sensitivities", 2 + j, pos.cellRow + i);
      });
    });
  }
  // Group the workings so the sheet prints cleanly
  for (let r = wStart; r < sen.row; r++) sen.ws.getRow(r).outlineLevel = 1;

  /* ---------------- Assumption Log ---------------- */
  log.title("Assumption Log", "Every assumption with its value, origin, confirmation status and source.");
  const lh = log.header(["Key", "Assumption", "Section", "Value", "Unit", "Confirmed", "Source", "As of", "Stale"]);
  log.freeze(lh, 1);
  for (const e of CATALOGUE) {
    const a = resolved[e.key]!;
    const r = log.row;
    log.label(1, r, e.key);
    log.label(2, r, e.label);
    log.label(3, r, SECTION_LABELS[e.section] ?? e.section);
    log.f(4, r, `=IF(ISBLANK(${nm(e.key)}),"MISSING",${nm(e.key)})`, unitFmt(e.unit));
    log.label(5, r, `${e.unit} / ${a.origin}`);
    log.label(6, r, a.confirmed ? "yes" : "no");
    const s = a.sourceId ? sourceTitle.get(a.sourceId) : undefined;
    log.label(7, r, s ? `${s.title}${s.publisher ? `, ${s.publisher}` : ""}` : a.requiresSource ? "NO SOURCE" : e.kind);
    log.label(8, r, a.asOf ?? "");
    log.label(9, r, a.stale ? "STALE" : "");
    log.row++;
  }
  if (ctx.auditTrail?.length) {
    log.blank();
    log.section("Change history");
    log.header(["When", "Who", "Assumption", "Old", "New", "", "Reason"]);
    for (const a of ctx.auditTrail) {
      const r = log.row;
      log.label(1, r, a.at);
      log.label(2, r, a.actor);
      log.label(3, r, a.key);
      log.label(4, r, a.oldValue === null || a.oldValue === undefined ? "" : String(a.oldValue));
      log.label(5, r, a.newValue === null || a.newValue === undefined ? "" : String(a.newValue));
      log.label(7, r, a.reason ?? "");
      log.row++;
    }
  }

  /* ---------------- Sources ---------------- */
  src.title("Sources", "Every market input and comparable cites one of these sources.");
  const sh = src.header(["ID", "Title", "Publisher", "URL", "Published", "Accessed", "Kind"]);
  src.freeze(sh, 1);
  for (const s of ctx.sources) {
    const r = src.row;
    src.label(1, r, s.id.slice(0, 8));
    src.label(2, r, s.title);
    src.label(3, r, s.publisher ?? "");
    if (s.url) {
      const c = src.ws.getCell(r, 4);
      c.value = { text: s.url, hyperlink: s.url };
      c.font = { name: "Calibri", size: 10, underline: true, color: { argb: "FF1F2A44" } };
    }
    src.label(5, r, s.publishedDate ?? "");
    src.label(6, r, s.accessedAt.slice(0, 10));
    src.label(7, r, s.kind);
    src.row++;
  }

  /* ---------------- Cover ---------------- */
  cover.ws.views = [{ showGridLines: false }];
  cover.title(engagement.clientName, engagement.title);
  const kv = (k: string, v: string) => {
    cover.label(1, cover.row, k, { bold: true });
    cover.label(2, cover.row, v);
    cover.row++;
  };
  kv("Status", result.provisional ? "PROVISIONAL: open items unresolved" : "Final");
  kv("Valuation date", engagement.valuationDate);
  kv("Standard / premise / basis", `${engagement.standardOfValue} / ${engagement.premise} / ${engagement.basis}`);
  kv("Model currency", `Nominal ${engagement.modelCurrency}; ${engagement.crossCheckCurrency} cross-check`);
  kv("Prepared by", `${branding.advisorName}, ${branding.firmName}`);
  kv("Run ID", ctx.runId);
  kv("Generated", ctx.generatedAt);
  cover.blank();
  cover.label(1, cover.row, "Concluded range (EGP)", { bold: true });
  cover.f(2, cover.row, `=TEXT(${rnd.refs[0]},"#,##0")&" – "&TEXT(${rnd.refs[2]},"#,##0")&"  (mid "&TEXT(${rnd.refs[1]},"#,##0")&")"`);
  cover.row += 2;
  cover.section("Conventions");
  const legend = cover.ws.getCell(cover.row, 1);
  legend.value = "Blue text";
  legend.font = { name: "Calibri", size: 10, color: { argb: BLUE } };
  cover.label(2, cover.row, "Input or sourced value. Change these only.");
  cover.row++;
  cover.label(1, cover.row, "Black text");
  cover.label(2, cover.row, "Formula. No result in this workbook is typed in.");
  cover.row++;
  cover.label(1, cover.row, "Yellow fill");
  cover.label(2, cover.row, "Missing input (listed under Open Items).");
  cover.row += 2;
  const open = result.openItems.filter((o) => !o.waived);
  cover.section(`Open items (${open.length})`);
  if (!open.length) cover.label(1, cover.row++, "None.");
  for (const o of open) {
    cover.label(1, cover.row, o.severity === "blocking" ? "Blocking" : "Warning");
    cover.label(2, cover.row, o.message);
    cover.row++;
  }
  cover.blank();
  cover.section("Disclaimer");
  const d = cover.ws.getCell(cover.row, 1);
  cover.ws.mergeCells(cover.row, 1, cover.row + 3, 2);
  d.value = branding.disclaimerText;
  d.alignment = { wrapText: true, vertical: "top" };
  d.font = { name: "Calibri", size: 9, italic: true };
  cover.row += 5;
  for (const ws of wb.worksheets) ws.headerFooter.oddFooter = `&L&8${branding.footerText.replace(/&/g, "&&")}&C&8${ws.name}&R&8Page &P of &N`;

  const buf = await wb.xlsx.writeBuffer();
  return { buffer: new Uint8Array(buf as ArrayBuffer), map: { checks } };
}
