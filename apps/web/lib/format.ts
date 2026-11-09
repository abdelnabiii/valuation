export const egp = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined || !Number.isFinite(n) ? "–" : n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const egpM = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "–" : `EGP ${(n / 1e6).toFixed(1)}m`);
export const pct = (n: number | null | undefined, digits = 1) => (n === null || n === undefined || !Number.isFinite(n) ? "–" : `${(n * 100).toFixed(digits)}%`);
export const mult = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "–" : `${n.toFixed(2)}x`);
export function fmtValue(v: number | null, unit: string) {
  if (v === null) return "–";
  if (unit === "pct") return pct(v, 2);
  if (unit === "x") return mult(v);
  if (unit === "egp") return egp(v);
  if (unit === "egp_per_usd") return v.toFixed(4);
  return String(v);
}
export const dt = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 16).replace("T", " ") : "–");
