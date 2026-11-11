import type { ExportContext } from "../context";
import type { Block } from "./model";
import { fmtDate, fmtPct } from "./format";

/**
 * "Basis of value" text for the report. Definitions are standard valuation
 * terms; every statement about this valuation is driven by the engagement
 * settings and the engine result (nothing is asserted that the model does not do).
 */

const STANDARDS: Record<string, { name: string; definition: string }> = {
  fair_market_value: {
    name: "Fair market value",
    definition:
      "the price, expressed in cash, at which the business would change hands between a hypothetical willing and able buyer and a hypothetical willing and able seller, acting at arm's length in an open and unrestricted market, when neither is under any compulsion to buy or sell and both have reasonable knowledge of the relevant facts. It is not the price a particular buyer might pay because of synergies or strategic reasons of their own.",
  },
  investment_value: {
    name: "Investment value",
    definition:
      "the value of the business to a particular investor, based on that investor's own requirements, expectations and synergies. It can differ from the price the business would fetch in the open market.",
  },
  fair_value: {
    name: "Fair value (IFRS 13)",
    definition:
      "the price that would be received to sell the business in an orderly transaction between market participants at the measurement date.",
  },
};

const PREMISES: Record<string, { name: string; definition: string }> = {
  going_concern: {
    name: "Going concern",
    definition:
      "the business is assumed to keep trading, with its operations, staff, brand, customer and supplier relationships in place. Its value therefore comes mainly from what it is expected to earn in future and, for asset-rich businesses, from the assets it uses.",
  },
  orderly_liquidation: {
    name: "Orderly liquidation",
    definition: "the business is assumed to cease trading and its assets to be sold over a reasonable period to obtain the best available price.",
  },
  forced_liquidation: {
    name: "Forced liquidation",
    definition: "the business is assumed to cease trading and its assets to be sold quickly, typically at a discount to orderly-liquidation value.",
  },
};

const BASES: Record<string, { name: string; definition: string }> = {
  control: {
    name: "Control",
    definition:
      "the value of an interest that can direct the business: appoint management, set pay and dividends, open or close sites, borrow, and sell the company.",
  },
  minority: {
    name: "Minority",
    definition:
      "the value of an interest that cannot direct the business on its own. A minority holder depends on the controlling shareholders' decisions on pay, dividends and a future sale, so a minority interest is usually worth less than its pro-rata share of the value of the whole company.",
  },
};

const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function basisOfValueBlocks(ctx: ExportContext): Block[] {
  const e = ctx.engagement;
  const r = ctx.result;
  const std = STANDARDS[e.standardOfValue] ?? { name: titleCase(e.standardOfValue), definition: "the standard of value stated in the engagement terms." };
  const prem = PREMISES[e.premise] ?? { name: titleCase(e.premise), definition: "the premise of value stated in the engagement terms." };
  const basis = BASES[e.basis] ?? { name: titleCase(e.basis), definition: "the basis stated in the engagement terms." };
  const dlom = r.adjustments.rows.find((a) => a.key === "adj.dlom");
  const otherAdj = r.adjustments.rows.filter((a) => a.key !== "adj.dlom" && a.pct > 0);

  const b: Block[] = [{ type: "heading", level: 3, text: "Basis of value" }];
  b.push({
    type: "paragraph",
    text: `This valuation is prepared on the basis of ${std.name.toLowerCase()}, on a ${prem.name.toLowerCase()} premise, for a ${basis.name.toLowerCase()} interest, as at ${fmtDate(e.valuationDate)}. The terms are explained below.`,
  });
  b.push({
    type: "bullets",
    items: [
      `${std.name} (standard of value): ${std.definition}`,
      `${prem.name} (premise of value): ${prem.definition}`,
      `${basis.name} (basis): ${basis.definition}`,
    ],
  });

  const effects: string[] = [];
  if (e.premise === "going_concern")
    effects.push(
      `Because the business is valued as a going concern, the conclusion rests on ${goingConcernBasis(ctx)}. The asset-based floor (what the equipment, fit-out and inventory would fetch if sold) is shown only as a minimum; it sets the value only if the other methods fall below it.`,
    );
  else
    effects.push(
      "Because the business is valued on a liquidation premise, the asset-based method is the relevant measure; the cash-flow and multiples results are shown for reference and should be weighted accordingly.",
    );
  if (e.basis === "control")
    effects.push(
      "Because a controlling interest is valued, earnings are normalized as a buyer in control would see them: owner pay and one-off items are added back and replaced by a market-rate manager cost. Transaction multiples, where used, mostly come from purchases of whole companies, which are control transactions.",
    );
  else
    effects.push(
      "A minority interest is being valued, but the model's earnings normalization and transaction multiples reflect a buyer in control. This valuation does not apply a separate discount for lack of control; the only adjustments applied are those listed under Value adjustments. Whether a further discount is warranted for the specific minority interest should be considered before the value is relied on.",
    );
  effects.push(
    dlom
      ? `A discount for lack of marketability of ${fmtPct(dlom.pct)} is applied, because shares in a private company cannot be sold as quickly or cheaply as listed shares.`
      : "No discount for lack of marketability is applied.",
  );
  if (otherAdj.length)
    effects.push(
      `Company-specific discounts are also applied for ${otherAdj.map((a) => `${/^[A-Z]{2}/.test(a.label) ? a.label : a.label.charAt(0).toLowerCase() + a.label.slice(1)} (${fmtPct(a.pct)})`).join(", ")}; the reasons are set out under Value adjustments.`,
    );
  effects.push(
    `The concluded range is the value of 100% of the equity${e.scope && !/100\s*%/.test(e.scope) ? `; the engagement scope is ${e.scope}` : ""}. The value of a partial shareholding is not simply its percentage of this range, because of the control and marketability factors above.`,
  );
  effects.push(
    `All amounts are in nominal ${e.modelCurrency}. The ${e.crossCheckCurrency} figures are translations at the spot rate on the valuation date and a cross-check; they are not a separate valuation.`,
  );
  b.push({ type: "heading", level: 3, text: "What this basis means for the number" });
  b.push({ type: "bullets", items: effects });
  return b;
}

/** Plain description of what the weighted methods rest on (from the reconciliation weights). */
function goingConcernBasis(ctx: ExportContext): string {
  const used = new Set(ctx.result.reconciliation.methods.filter((m) => m.weight > 0 && m.method !== "asset").map((m) => m.method));
  const parts: string[] = [];
  if (used.has("dcf")) parts.push("forecast cash flows");
  if (used.has("multiples")) parts.push("market multiples");
  if (used.has("nav")) parts.push("the market value of its assets");
  if (used.has("income_cap")) parts.push("the capitalised income its assets produce");
  if (used.has("vc")) parts.push("the expected exit value under the business plan");
  if (used.has("scorecard")) parts.push("comparison with funded peers");
  if (used.has("round")) parts.push("the price of its latest funding round");
  if (!parts.length) return "the methods set out in the reconciliation";
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
