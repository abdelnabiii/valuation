export const maxDuration = 800;
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
  const relevant = result.assumptions.filter((a) => a.relevant);
  const sections = [...new Set(CATALOGUE.map((c) => c.section))].filter((s) => relevant.some((a) => a.section === s));
  const stale = relevant.filter((a) => a.stale).length;
  const unconfirmed = relevant.filter((a) => a.value !== null && !a.confirmed).length;
  const missing = relevant.filter((a) => a.value === null && !a.key.startsWith("mult.selected_") && !a.key.startsWith("macro.fx_forecast_")).length;
  return (
    <div className="stack">
      <p className="muted">Industry profile: <strong>{result.profile.label}</strong>. Only assumptions that apply to this profile are shown.</p>
      <ResearchPanel engagementId={id} kind="macro" proposals={proposals} enabled={hasClaude()} status={await researchStatus(id, "macro")} />
      <p className="muted">
        {missing} without a value · {unconfirmed} unconfirmed · {stale} older than 30 days. Market data must cite a dated source; system defaults stay open items until you confirm them.
      </p>
      {sections.map((s) => (
        <section key={s} id={s}>
          <h2>{SECTION_LABELS[s] ?? s}</h2>
          <AssumptionTable engagementId={id} rows={relevant.filter((a) => a.section === s)} sources={sources} />
        </section>
      ))}
    </div>
  );
}
