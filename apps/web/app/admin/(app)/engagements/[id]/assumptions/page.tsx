export const maxDuration = 300;
import { CATALOGUE } from "@valuation/engine";
import { preview } from "@/lib/runs";
import { sourceOptions } from "@/lib/sources";
import { proposalsFor } from "@/lib/proposals";
import { hasClaude } from "@/lib/claude";
import { researchStatus } from "@/lib/research-status";
import { SECTION_LABELS } from "@valuation/exports";
import AssumptionTable from "@/components/admin/AssumptionTable";
import ResearchPanel from "@/components/admin/ResearchPanel";

export default async function Assumptions({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { result } = await preview(id);
  const sources = await sourceOptions(id);
  const proposals = await proposalsFor(id, "macro");
  const sections = [...new Set(CATALOGUE.map((c) => c.section))];
  const stale = result.assumptions.filter((a) => a.stale).length;
  const unconfirmed = result.assumptions.filter((a) => a.value !== null && !a.confirmed).length;
  const missing = result.assumptions.filter((a) => a.value === null).length;
  return (
    <div className="stack">
      <ResearchPanel engagementId={id} kind="macro" proposals={proposals} enabled={hasClaude()} status={await researchStatus(id, "macro")} />
      <p className="muted">
        {missing} without a value · {unconfirmed} unconfirmed · {stale} older than 30 days. Market data must cite a dated source; system defaults stay open items until you confirm them.
      </p>
      {sections.map((s) => (
        <section key={s} id={s}>
          <h2>{SECTION_LABELS[s] ?? s}</h2>
          <AssumptionTable engagementId={id} rows={result.assumptions.filter((a) => a.section === s)} sources={sources} />
        </section>
      ))}
    </div>
  );
}
