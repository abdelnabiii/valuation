"use client";
import { useState, useTransition } from "react";
import { unwaiveOpenItem, waiveOpenItem } from "@/app/admin/actions";

export default function OpenItemRow({ engagementId, item, waiver }: { engagementId: string; item: { key: string; category: string; severity: string; message: string; waived?: boolean }; waiver: { reason: string; by: string; at: string } | null }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <tr>
      <td><span className={`tag ${item.waived ? "" : item.severity === "blocking" ? "bad" : "warn"}`}>{item.waived ? "Waived" : item.severity === "blocking" ? "Blocking" : "Warning"}</span></td>
      <td className="muted">{item.category.replace(/_/g, " ")}</td>
      <td>
        {item.message}
        {waiver && <div className="faint">Waived by {waiver.by} on {waiver.at.slice(0, 10)}: {waiver.reason}</div>}
        {open && (
          <div className="row" style={{ marginTop: 6, flexWrap: "nowrap" }}>
            <input placeholder="Why is this acceptable? (recorded)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="btn small" disabled={pending} onClick={() => start(async () => { const r = await waiveOpenItem(engagementId, item.key, reason); if (!r.ok) setErr(r.error ?? null); else setOpen(false); })}>Waive</button>
          </div>
        )}
        {err && <div className="notice bad">{err}</div>}
      </td>
      <td style={{ whiteSpace: "nowrap" }}>
        {item.waived ? (
          <button className="btn small secondary" disabled={pending} onClick={() => start(() => unwaiveOpenItem(engagementId, item.key))}>Reinstate</button>
        ) : (
          <button className="btn small secondary" onClick={() => setOpen(!open)}>{open ? "Cancel" : "Waive…"}</button>
        )}
      </td>
    </tr>
  );
}
