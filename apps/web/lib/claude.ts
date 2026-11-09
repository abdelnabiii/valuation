import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";

export function claude() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set. Add it in Vercel → Project → Settings → Environment Variables.");
  return new Anthropic();
}

export const hasClaude = () => !!process.env.ANTHROPIC_API_KEY;

export interface SearchHit {
  url: string;
  title: string;
  pageAge: string | null;
}

/**
 * Runs a web-search turn and returns the model's written findings plus every
 * URL the search actually returned. Callers must only accept figures whose
 * URL is in `hits` (prevents invented sources).
 */
export async function searchTurn(system: string, prompt: string, maxUses = 12): Promise<{ text: string; hits: SearchHit[] }> {
  const client = claude();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
  const hits = new Map<string, SearchHit>();
  let text = "";
  for (let i = 0; i < 4; i++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: maxUses }],
      messages,
    });
    const res = await stream.finalMessage();
    if (res.stop_reason === "refusal") throw new Error("The research request was declined by the model.");
    for (const block of res.content) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) if (r.type === "web_search_result") hits.set(normUrl(r.url), { url: r.url, title: r.title, pageAge: r.page_age ?? null });
      }
      if (block.type === "text") text += block.text;
    }
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content });
  }
  return { text, hits: [...hits.values()] };
}

export function normUrl(u: string) {
  try {
    const x = new URL(u);
    x.hash = "";
    return (x.host.replace(/^www\./, "") + x.pathname.replace(/\/$/, "") + x.search).toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}
