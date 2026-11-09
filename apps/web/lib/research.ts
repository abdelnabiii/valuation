import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { and, eq } from "drizzle-orm";
import { CATALOGUE } from "@valuation/engine";
import { claude, MODEL, normUrl, searchTurn, type SearchHit } from "./claude";
import { db, engagement, researchProposal, source } from "./db";
import { audit } from "./audit";

/** Macro keys fetched live (never hard-coded). */
export const MACRO_KEYS = [
  "macro.us_rf",
  "macro.erp",
  "macro.crp_egypt",
  "macro.egp_tbill",
  "macro.egp_inflation_y1",
  "macro.egp_inflation_y2",
  "macro.egp_inflation_y3",
  "macro.egp_inflation_y4",
  "macro.egp_inflation_y5",
  "macro.egp_inflation_lt",
  "macro.usd_inflation",
  "macro.fx_usd_egp",
  "macro.tax_rate",
  "macro.vat_rate",
  "dr.size_premium",
];

const SYSTEM = `You are a research assistant to an independent valuation advisor. You search the web and report only figures that a source you found states explicitly.
Rules:
- Never estimate, infer, average or invent a number. If you cannot find a figure stated in a source, say "not found".
- For every figure give: the exact value as stated, the URL of the page that states it, the page title, the publisher, the publication or "as of" date shown on that page, and a short verbatim quote containing the figure.
- Prefer primary sources (Central Bank of Egypt, Ministry of Finance, CAPMAS, US Treasury, IMF, World Bank, Damodaran Online at NYU Stern, Kroll, EGX filings, company filings, reputable financial press).
- Report percentages as written (e.g. "27.25%").`;

const MacroItem = z.object({
  key: z.string(),
  found: z.boolean(),
  value_decimal: z.number().nullable().describe("Percent as decimal (27.25% -> 0.2725); FX as EGP per USD"),
  as_of_date: z.string().nullable().describe("YYYY-MM-DD as stated by the source"),
  url: z.string().nullable(),
  title: z.string().nullable(),
  publisher: z.string().nullable(),
  quote: z.string().nullable(),
  note: z.string().nullable(),
});
const MacroOut = z.object({ items: z.array(MacroItem) });

const CompItem = z.object({
  name: z.string(),
  kind: z.enum(["transaction", "listed"]),
  country: z.string().nullable(),
  date: z.string().nullable().describe("YYYY-MM-DD of the deal or of the market data"),
  description: z.string().nullable(),
  ev_usd_m: z.number().nullable(),
  ev_to_ebitda: z.number().nullable(),
  ev_to_revenue: z.number().nullable(),
  price_to_sde: z.number().nullable(),
  url: z.string(),
  title: z.string().nullable(),
  publisher: z.string().nullable(),
  quote: z.string().describe("Verbatim text from the source stating the multiple or the figures used"),
});
const CompOut = z.object({ items: z.array(CompItem) });

async function structure<T extends z.ZodType>(schema: T, findings: string, instruction: string): Promise<z.infer<T>> {
  const res = await claude().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { format: zodOutputFormat(schema), effort: "low" },
    messages: [
      {
        role: "user",
        content: `${instruction}\n\nUse only what the research notes below state. Do not add figures.\n\n<research_notes>\n${findings}\n</research_notes>`,
      },
    ],
  });
  if (!res.parsed_output) throw new Error("Could not structure research results.");
  return res.parsed_output as z.infer<T>;
}

function verified(url: string | null, hits: SearchHit[]) {
  if (!url) return null;
  const n = normUrl(url);
  return hits.find((h) => normUrl(h.url) === n) ?? null;
}

async function saveSource(engagementId: string, kind: "macro" | "transaction" | "listed", url: string, title: string | null, publisher: string | null, date: string | null, quote: string | null) {
  const [s] = await db()
    .insert(source)
    .values({
      engagementId,
      kind,
      title: (title || url).slice(0, 300),
      publisher,
      url,
      publishedDate: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      excerpt: quote?.slice(0, 2000) ?? null,
      retrievedBy: "research",
      accepted: false,
    })
    .returning();
  return s!;
}

export async function researchMacro(engagementId: string, actor: string, keys = MACRO_KEYS) {
  const [e] = await db().select().from(engagement).where(eq(engagement.id, engagementId));
  const vd = e?.valuationDate ?? new Date().toISOString().slice(0, 10);
  const wanted = CATALOGUE.filter((c) => keys.includes(c.key)).map((c) => `- ${c.key}: ${c.label}`).join("\n");
  const { text, hits } = await searchTurn(
    SYSTEM,
    `Valuation date: ${vd}. Market: Egypt. Find the most recent published value, on or before the valuation date where possible, for each item:\n${wanted}\n\nNotes: EGP inflation forecasts for years 1-5 should come from a published forecast (e.g. IMF World Economic Outlook / Article IV, central bank or ministry projections) and say which calendar year each figure refers to. Long-term EGP inflation: the latest year of such a forecast. Equity risk premium and Egypt country risk premium: Damodaran's current dataset. Size premium: a published size-premium study for the smallest size decile. Write one paragraph per item with value, URL, title, publisher, date and a verbatim quote.`,
  );
  const out = await structure(MacroOut, text, `Convert the notes into one item per key. Keys: ${keys.join(", ")}.`);
  let created = 0;
  const rejected: string[] = [];
  for (const it of out.items) {
    if (!keys.includes(it.key)) continue;
    if (!it.found || it.value_decimal === null) {
      rejected.push(`${it.key}: not found`);
      continue;
    }
    const hit = verified(it.url, hits);
    if (!hit) {
      rejected.push(`${it.key}: cited URL was not among search results`);
      continue;
    }
    const s = await saveSource(engagementId, "macro", hit.url, it.title ?? hit.title, it.publisher, it.as_of_date, it.quote);
    await db().insert(researchProposal).values({
      engagementId,
      kind: "macro",
      targetKey: it.key,
      sourceId: s.id,
      payload: { value: it.value_decimal, asOf: it.as_of_date, quote: it.quote, note: it.note, pageAge: hit.pageAge },
    });
    created++;
  }
  await audit({ engagementId, actor, action: "research", entity: "macro", newValue: { proposals: created, rejected } });
  return { created, rejected };
}

export async function researchComparables(engagementId: string, actor: string) {
  const { text, hits } = await searchTurn(
    SYSTEM,
    `Find valuation multiples for comparables to a specialty coffee / café chain in Egypt:
1. Transactions (last 5 years) involving coffee shop, café, bakery-café or quick-service F&B businesses in Egypt, the GCC, North Africa and other emerging markets, where a source states EV/EBITDA, EV/revenue or the deal value with revenue or EBITDA.
2. Listed F&B and restaurant companies on EGX and regional exchanges (and, if few, listed coffee chains in emerging markets) with current EV/EBITDA and EV/revenue as stated by a data source.
For each: name, deal or data date, country, what the multiple is, URL, title, publisher, and a verbatim quote stating the figure. Only include multiples a source states or the exact figures needed to compute them (deal value and the stated EBITDA or revenue).`,
    15,
  );
  const out = await structure(CompOut, text, "Convert the notes into one item per comparable. Compute a multiple only when the notes give both the value and the earnings figure explicitly.");
  let created = 0;
  const rejected: string[] = [];
  for (const it of out.items) {
    const hit = verified(it.url, hits);
    if (!hit) {
      rejected.push(`${it.name}: cited URL was not among search results`);
      continue;
    }
    if (it.ev_to_ebitda === null && it.ev_to_revenue === null && it.price_to_sde === null) {
      rejected.push(`${it.name}: no multiple stated`);
      continue;
    }
    const s = await saveSource(engagementId, it.kind, hit.url, it.title ?? hit.title, it.publisher, it.date, it.quote);
    await db().insert(researchProposal).values({ engagementId, kind: "comparable", sourceId: s.id, payload: it });
    created++;
  }
  await audit({ engagementId, actor, action: "research", entity: "comparables", newValue: { proposals: created, rejected } });
  return { created, rejected };
}

export async function pendingProposals(engagementId: string) {
  return db()
    .select({ p: researchProposal, s: source })
    .from(researchProposal)
    .leftJoin(source, eq(source.id, researchProposal.sourceId))
    .where(and(eq(researchProposal.engagementId, engagementId), eq(researchProposal.status, "pending")));
}
