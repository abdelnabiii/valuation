import { eq } from "drizzle-orm";
import { comparable, db, source } from "@/lib/db";
import { sourceOptions } from "@/lib/sources";
import { proposalsFor } from "@/lib/proposals";
import { hasClaude } from "@/lib/claude";
import ComparablesEditor from "@/components/admin/ComparablesEditor";
import ResearchPanel from "@/components/admin/ResearchPanel";

export default async function Comparables({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db().select({ c: comparable, s: source }).from(comparable).innerJoin(source, eq(source.id, comparable.sourceId)).where(eq(comparable.engagementId, id));
  const sources = await sourceOptions(id);
  const proposals = await proposalsFor(id, "comparable");
  const n = (v: string | null) => (v === null ? null : Number(v));
  return (
    <div className="stack">
      <ResearchPanel engagementId={id} kind="comparables" proposals={proposals} enabled={hasClaude()} />
      <ComparablesEditor
        engagementId={id}
        sources={sources}
        comps={rows.map(({ c, s }) => ({ id: c.id, name: c.name, kind: c.kind, country: c.country, date: c.dealDate, e: n(c.evToEbitda), r: n(c.evToRevenue), s: n(c.priceToSde), included: c.included, reason: c.exclusionReason, sourceTitle: s.title, sourceUrl: s.url, sourceDate: s.publishedDate }))}
      />
    </div>
  );
}
