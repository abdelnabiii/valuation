/** Number / date / label formatting shared by report and deck. */

const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Full thousands-separated amount for tables. Negatives in parentheses. */
export function fmtAmount(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  const r = Math.round(v);
  if (r === 0) return "0";
  return r < 0 ? `(${nf0.format(-r)})` : nf0.format(r);
}

/** Compact amount for prose: 13,400,000 -> "13.4m", 850,000 -> "850k". */
export function fmtCompact(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(1)}bn`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(1)}m`;
  if (a >= 1e3) return `${sign}${Math.round(a / 1e3)}k`;
  return `${sign}${Math.round(a)}`;
}

/** "EGP 13.4m" (prose). */
export function fmtMoney(v: number | null | undefined, ccy = "EGP"): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  return `${ccy} ${fmtCompact(v)}`;
}

/** Percent with 1 decimal: 0.19375 -> "19.4%". */
export function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  return `${(v * 100).toFixed(1)}%`;
}

export function fmtMultiple(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  return `${v.toFixed(1)}x`;
}

export function fmtYears(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  return `${v.toFixed(1)}`;
}

export function fmtFactor(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  return v.toFixed(3);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** ISO date -> "31 December 2025". Returns the input unchanged if unparsable. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "n/a";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return iso;
  return `${Number(m[3])} ${month} ${m[1]}`;
}

/** "fair_market_value" -> "Fair market value". */
export function humanize(s: string | null | undefined): string {
  if (!s) return "n/a";
  const t = s.replace(/[_-]+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Format a resolved assumption value according to its catalogue unit. */
export function fmtByUnit(v: number | null, unit: string): string {
  if (v === null || !Number.isFinite(v)) return "n/a";
  switch (unit) {
    case "pct":
      return fmtPct(v);
    case "egp":
      return `EGP ${fmtAmount(v)}`;
    case "x":
      return fmtMultiple(v);
    case "egp_per_usd":
      return `${v.toFixed(2)} EGP/USD`;
    case "count":
      return nf0.format(v);
    case "ratio":
      return v.toFixed(2);
    default:
      return String(v);
  }
}

export const CHANNEL_LABELS: Record<string, string> = {
  dine_in: "Dine-in",
  delivery: "Delivery apps",
  wholesale: "Wholesale",
  online: "Online",
};

export const COST_LABELS: Record<string, string> = {
  cogs: "Cost of goods sold",
  labour: "Labour",
  rent: "Rent",
  delivery_commission: "Delivery commission",
  marketing: "Marketing",
  utilities: "Utilities",
  maintenance: "Maintenance",
  other_opex: "Other operating costs",
  head_office: "Head office",
};

export const ADDBACK_LABELS: Record<string, string> = {
  owner_pay: "Owner pay",
  one_off: "One-off",
  related_party: "Related party",
  non_operating: "Non-operating",
};

export const ORIGIN_LABELS: Record<string, string> = {
  input: "Input",
  derived: "Derived",
  default: "System default",
  missing: "Missing",
};

/** Office-safe faces; anything else falls back to Arial in Word/PowerPoint. */
const OFFICE_SAFE = [
  "Arial",
  "Calibri",
  "Aptos",
  "Cambria",
  "Candara",
  "Corbel",
  "Constantia",
  "Garamond",
  "Georgia",
  "Helvetica",
  "Segoe UI",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
];

export function officeFont(typeface: string | null | undefined): string {
  const t = (typeface ?? "").trim();
  const hit = OFFICE_SAFE.find((f) => f.toLowerCase() === t.toLowerCase());
  return hit ?? "Arial";
}
