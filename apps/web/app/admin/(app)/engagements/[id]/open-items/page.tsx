import { eq } from "drizzle-orm";
import { db, openItemResolution } from "@/lib/db";
import { preview } from "@/lib/runs";
import OpenItemRow from "@/components/admin/OpenItemRow";

export default async function OpenItems({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { result } = await preview(id);
  const waivers = await db().select().from(openItemResolution).where(eq(openItemResolution.engagementId, id));
  const order = (s: string, w?: boolean) => (w ? 2 : s === "blocking" ? 0 : 1);
  const items = [...result.openItems].sort((a, b) => order(a.severity, a.waived) - order(b.severity, b.waived));
  const blocking = items.filter((i) => i.severity === "blocking" && !i.waived).length;
  return (
    <div className="stack">
      <p className={`notice ${blocking ? "" : "ok"}`}>
        {blocking ? `${blocking} blocking items. Every export is stamped PROVISIONAL until they are resolved or waived with a reason.` : "No blocking items. New runs will be final."} Fix items at the source (intake, assumptions, comparables); waive only when the gap does not affect the conclusion.
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Severity</th><th>Type</th><th>Item</th><th /></tr></thead>
          <tbody>
            {items.map((i) => {
              const w = waivers.find((x) => x.itemKey === i.key);
              return <OpenItemRow key={i.key} engagementId={id} item={i} waiver={w ? { reason: w.reason, by: w.resolvedBy, at: w.resolvedAt.toISOString() } : null} />;
            })}
            {!items.length && <tr><td colSpan={4} className="empty">No open items.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
