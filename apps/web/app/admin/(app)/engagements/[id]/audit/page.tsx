import { desc, eq } from "drizzle-orm";
import { auditLog, db } from "@/lib/db";

const show = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v));

export default async function Audit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db().select().from(auditLog).where(eq(auditLog.engagementId, id)).orderBy(desc(auditLog.at)).limit(1000);
  return (
    <div className="stack">
      <p className="muted">Who changed what and when. Client entries show as client:&lt;link id&gt;. Latest 1,000 entries.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>When (UTC)</th><th>Who</th><th>Action</th><th>What</th><th>Field</th><th>Old</th><th>New</th><th>Reason</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ whiteSpace: "nowrap" }}>{r.at.toISOString().slice(0, 19).replace("T", " ")}</td>
                <td>{r.actor}</td>
                <td>{r.action}</td>
                <td>{r.entity}</td>
                <td className="mono">{r.field ?? ""}</td>
                <td className="mono" style={{ maxWidth: 220, overflowWrap: "anywhere" }}>{show(r.oldValue).slice(0, 300)}</td>
                <td className="mono" style={{ maxWidth: 220, overflowWrap: "anywhere" }}>{show(r.newValue).slice(0, 300)}</td>
                <td>{r.reason ?? ""}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="empty">Nothing recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
