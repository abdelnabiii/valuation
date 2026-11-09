import "server-only";
import { CATALOGUE_BY_KEY } from "@valuation/engine";
import { pendingProposals } from "./research";
import type { Proposal } from "@/components/admin/ResearchPanel";

export async function proposalsFor(engagementId: string, kind: "macro" | "comparable"): Promise<Proposal[]> {
  const rows = await pendingProposals(engagementId);
  return rows
    .filter((r) => r.p.kind === kind)
    .map(({ p, s }) => {
      const pl = p.payload as Record<string, unknown>;
      const entry = p.targetKey ? CATALOGUE_BY_KEY[p.targetKey] : undefined;
      let value = "";
      if (kind === "macro") {
        const v = pl.value as number;
        value = entry?.unit === "pct" ? `${(v * 100).toFixed(2)}%` : String(v);
      } else {
        value = [pl.ev_to_ebitda ? `${pl.ev_to_ebitda}x EBITDA` : null, pl.ev_to_revenue ? `${pl.ev_to_revenue}x revenue` : null, pl.price_to_sde ? `${pl.price_to_sde}x SDE` : null].filter(Boolean).join(", ");
      }
      return {
        id: p.id,
        kind: p.kind,
        targetKey: p.targetKey,
        label: kind === "macro" ? (entry?.label ?? p.targetKey ?? "") : `${pl.name as string} (${pl.kind as string}${pl.country ? `, ${pl.country as string}` : ""}${pl.date ? `, ${pl.date as string}` : ""})`,
        value,
        asOf: (pl.asOf as string | null) ?? (pl.date as string | null) ?? s?.publishedDate ?? null,
        quote: (pl.quote as string | null) ?? null,
        sourceTitle: s?.title ?? null,
        sourceUrl: s?.url ?? null,
        publisher: s?.publisher ?? null,
      };
    });
}
