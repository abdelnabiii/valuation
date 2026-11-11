/**
 * Profile-aware wording shared by the report and the deck. Labels come from
 * the engine's industry profile (profiles.ts); F&B-specific terms (four-wall,
 * prime cost, delivery apps) are only used for the F&B profile.
 */
import { getProfile, type Channel, type EngineResult, type ProfileDef } from "@valuation/engine";
import type { ExportContext } from "../context";
import { COST_LABELS, humanize } from "./format";

export type Model = ProfileDef["model"];

export interface Wording {
  profile: ProfileDef;
  model: Model;
  isFnb: boolean;
  /** "Outlet" / "Store" ... */
  Unit: string;
  Units: string;
  unit: string;
  units: string;
  /** Unit-level EBITDA label: "Four-wall EBITDA" (F&B) or "Site EBITDA". */
  unitEbitda: string;
  /** "Prime cost" (F&B) or "Direct cost". */
  directCost: string;
  channelLabel: (c: Channel) => string;
  costLabel: (k: string) => string;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function wording(ctx: ExportContext): Wording {
  const profile = getProfile(ctx.input.meta.profileKey ?? ctx.result.profile?.key);
  const isFnb = profile.key === "fnb";
  return {
    profile,
    model: profile.model,
    isFnb,
    Unit: cap(profile.unitNoun.singular),
    Units: cap(profile.unitNoun.plural),
    unit: profile.unitNoun.singular,
    units: profile.unitNoun.plural,
    unitEbitda: isFnb ? "Four-wall EBITDA" : `${cap(profile.unitNoun.singular)}-level EBITDA`,
    directCost: isFnb ? "Prime cost" : "Direct cost",
    channelLabel: (c) => profile.channelLabels[c] ?? humanize(c),
    costLabel: (k) => {
      if (k === "delivery_commission") return isFnb ? "Delivery commission" : `Commissions (${profile.channelLabels.delivery.toLowerCase()})`;
      return COST_LABELS[k] ?? humanize(k);
    },
  };
}

/** Short method labels for compact places (deck KPI line). */
export const METHOD_SHORT: Record<string, string> = {
  dcf: "DCF",
  multiples: "Multiples",
  asset: "Asset floor",
  nav: "NAV",
  income_cap: "Income cap.",
  vc: "VC method",
  scorecard: "Scorecard",
  round: "Funding round",
};

export function methodWeight(r: EngineResult, method: string): number {
  return r.reconciliation.methods.find((m) => m.method === method)?.weight ?? 0;
}

/** True when the DCF carries weight in the reconciliation (its detail is shown). */
export function dcfRelied(r: EngineResult): boolean {
  return methodWeight(r, "dcf") > 0;
}

export function assumptionValue(r: EngineResult, key: string): number | null {
  return r.assumptions.find((a) => a.key === key)?.value ?? null;
}

/** Base-scenario real revenue growth per forecast year (operating / asset-heavy models). */
export function realGrowthPath(r: EngineResult, scenario: "base" | "upside" | "downside" = "base"): (number | null)[] {
  return [1, 2, 3, 4, 5].map((y) => assumptionValue(r, `dcf.${scenario}.growth_y${y}`));
}

export interface Step {
  title: string;
  /** One-line version for the deck. */
  short: string;
  /** Full sentence(s) for the report. */
  long: string;
}

/** Methodology steps for the profile's model and methods (report and deck). */
export function methodologySteps(ctx: ExportContext): Step[] {
  const w = wording(ctx);
  const r = ctx.result;
  const methods = new Set(r.reconciliation.methods.map((m) => m.method));
  const steps: Step[] = [];
  const relied = dcfRelied(r);
  const early = w.model === "early_stage";

  steps.push({
    title: "Normalization",
    short: "Addbacks to SDE, less a market-rate manager, to normalized EBITDA.",
    long: "Normalization: reported EBITDA is adjusted for owner pay, one-off, related-party and non-operating items to give seller's discretionary earnings (SDE); a market-rate manager cost is then deducted to reach normalized EBITDA.",
  });

  if (w.model === "units")
    steps.push({
      title: `${w.Unit} economics`,
      short: w.isFnb ? "Four-wall margin, prime cost, rent and payback per outlet." : `${w.Unit}-level margin, direct cost, rent and payback per ${w.unit}.`,
      long: w.isFnb
        ? "Unit economics: each outlet's four-wall profitability, prime cost, rent ratio and payback are measured; mature outlets set the template for new openings."
        : `${w.Unit} economics: each ${w.unit}'s profitability after its direct costs, its rent ratio and its payback are measured; mature ${w.units} set the template for new openings.`,
    });
  if (w.model === "operating")
    steps.push({
      title: "Revenue and margin forecast",
      short: "Company-level real revenue growth per year and an EBITDA margin path.",
      long: "Revenue and margin forecast: the forecast is built at company level from real revenue growth per year (above EGP inflation) and an EBITDA margin path, with capex, depreciation and working capital as percentages of revenue.",
    });
  if (methods.has("nav"))
    steps.push({
      title: "Net asset value",
      short: "Assets at market value from appraisals.",
      long: "Net asset value: each asset is taken at its market value from an appraisal or valuer opinion; assets without a market value are listed as open items.",
    });
  if (methods.has("income_cap"))
    steps.push({
      title: "Income capitalisation",
      short: "Net operating income divided by a sourced cap rate.",
      long: "Income capitalisation: normalized net operating income is divided by a capitalisation rate from comparable transactions, with a range of plus and minus the cap-rate spread.",
    });
  if (methods.has("vc"))
    steps.push({
      title: "Venture capital method",
      short: "Exit value from the plan, discounted at a target return, after dilution.",
      long: "Venture capital method: the revenue in the exit year from the business plan is multiplied by an EV/Revenue exit multiple, reduced for expected dilution from future rounds and discounted back at the target return of a venture investor.",
    });
  if (methods.has("scorecard"))
    steps.push({
      title: "Scorecard method",
      short: "Median pre-money of funded peers, adjusted by weighted factor scores.",
      long: "Scorecard method: the median pre-money value of comparable funded startups is adjusted by weighted scores for team, opportunity, product, competition, sales, funding needs and other factors.",
    });
  if (methods.has("round"))
    steps.push({
      title: "Recent funding round",
      short: "Post-money value of the latest priced round, adjusted for changes since.",
      long: "Recent funding round: the post-money value of the latest priced round is adjusted for changes in the business and the market since the round.",
    });

  if (methods.has("dcf")) {
    if (relied || (!early && r.dcf.available)) {
      steps.push({
        title: "Discount rate",
        short: ctx.input.meta.discountRateMethod === "usd_buildup" ? "USD build-up translated to EGP by inflation differential." : "EGP T-bill build-up.",
        long: "Discount rate: a cost of equity is built up from a risk-free rate, equity, country, size and company-specific premia, and translated into nominal EGP rates per forecast year.",
      });
      steps.push({
        title: "DCF",
        short: "Five-year forecast, three probability-weighted scenarios, blended terminal value.",
        long: "Discounted cash flow: five-year free cash flow forecasts are prepared for base, upside and downside scenarios, with a blended Gordon-growth and exit-multiple terminal value, and probability-weighted.",
      });
    } else
      steps.push({
        title: "DCF (not relied on)",
        short: "Not relied on: current cash flows do not reflect the plan.",
        long: "Discounted cash flow: not relied on (weight 0%), because current earnings and near-term cash flows do not yet reflect the business plan.",
      });
  }
  if (methods.has("multiples"))
    steps.push({
      title: "Multiples",
      short: "EV/EBITDA, EV/Revenue, Price/SDE from sourced comparables.",
      long: "Market multiples: EV/EBITDA, EV/Revenue and Price/SDE from sourced comparables are applied to the normalized earnings base.",
    });
  steps.push({
    title: "Asset floor",
    short: "Recoverable value of fit-out, equipment and inventory, net of liquidation costs.",
    long: "Asset-based floor: the recoverable value of fit-out, equipment, furniture and inventory, net of liquidation costs, sets a floor to the value.",
  });
  const adjNames = r.adjustments.rows.map((a) => lowerLabel(a.label));
  steps.push({
    title: "Adjustments",
    short: `${cap(listJoin(adjNames.map((a) => a.replace(/ \(dlom\)/i, ""))))} discounts.`,
    long: `Value adjustments: discounts for ${listJoin(adjNames)} are applied multiplicatively.`,
  });
  const hasEquity = r.reconciliation.methods.some((m) => m.basis === "equity" && m.weight > 0);
  steps.push({
    title: "Bridge and reconciliation",
    short: hasEquity ? "Equity methods to EV via net debt, weighted, floor test, back to equity, rounded." : "Weighted EV, floor test, net debt and deposits to equity, rounded.",
    long:
      "Equity bridge and reconciliation: method results are weighted" +
      (hasEquity ? " (methods that give an equity value are first converted to an enterprise-value equivalent by removing the net-debt bridge)" : "") +
      ", the asset floor is tested, net debt and deposits are bridged to equity, adjustments applied and the range rounded.",
  });
  const grids = r.sensitivities.filter((g) => g.values.length);
  if (grids.length)
    steps.push({
      title: "Sensitivities",
      short: `${cap(listJoin(grids.map((g) => lowerLabel(g.title))))}.`,
      long: `Sensitivity analysis: value is re-computed across ${listJoin(grids.map((g) => lowerLabel(g.title)))}.`,
    });
  return steps;
}

export function lowerLabel(s: string): string {
  return /^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
}

export function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
