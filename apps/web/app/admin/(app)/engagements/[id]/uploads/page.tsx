import { desc, eq, inArray } from "drizzle-orm";
import { db, extractionRow, unit, upload } from "@/lib/db";
import ExtractionReview from "@/components/admin/ExtractionReview";

export default async function Uploads({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ups = await db().select().from(upload).where(eq(upload.engagementId, id)).orderBy(desc(upload.createdAt));
  const rows = ups.length ? await db().select().from(extractionRow).where(inArray(extractionRow.uploadId, ups.map((u) => u.id))) : [];
  const units = await db().select({ id: unit.id, name: unit.name }).from(unit).where(eq(unit.engagementId, id));
  return (
    <div className="stack">
      <p className="muted">Figures extracted from uploaded P&amp;Ls are not used until you confirm them here. Confirmed figures overwrite the matching cells in the intake grid and are marked as extracted.</p>
      {!ups.length && <div className="panel empty">No uploads yet.</div>}
      {ups.map((u) => (
        <div className="panel" key={u.id}>
          <ExtractionReview
            engagementId={id}
            upload={{ id: u.id, filename: u.filename, status: u.status, note: u.extractionNote, createdAt: u.createdAt.toISOString(), by: u.uploadedBy }}
            rows={rows
              .filter((r) => r.uploadId === u.id)
              .map((r) => ({
                id: r.id,
                rawLabel: r.rawLabel,
                period: r.period,
                amount: r.amount === null ? null : Number(r.amount),
                lineItem: r.proposedLineItem,
                channel: r.proposedChannel,
                unitId: r.proposedUnitId,
                confidence: r.confidence === null ? null : Number(r.confidence),
                decision: r.decision,
              }))}
            units={units}
          />
        </div>
      ))}
    </div>
  );
}
