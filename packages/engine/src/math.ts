/** Numeric helpers that mirror Excel semantics exactly. */

/** Excel ROUND: half away from zero. */
export function xlRound(x: number, digits = 0): number {
  const f = 10 ** digits;
  const v = Math.abs(x) * f;
  // Excel works to 15 significant digits; this also absorbs representation
  // error such as 1.005 * 100 = 100.49999999999999.
  const r = Math.round(Number(v.toPrecision(15)));
  return (Math.sign(x) * r) / f;
}

/** Excel ROUND(x / step, 0) * step. */
export function roundTo(x: number, step: number): number {
  if (!step) return x;
  return xlRound(x / step, 0) * step;
}

/** Excel QUARTILE.INC / PERCENTILE.INC. */
export function percentileInc(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = s[lo]!;
  const b = s[hi]!;
  return a + (b - a) * (pos - lo);
}

export const median = (v: number[]) => percentileInc(v, 0.5);

export function sum(v: number[]): number {
  let t = 0;
  for (const x of v) t += x;
  return t;
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export function monthsBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + "T00:00:00Z");
  const b = new Date(toIso + "T00:00:00Z");
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso.slice(0, 10) + "T00:00:00Z");
  const b = Date.parse(toIso.slice(0, 10) + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}
