"use client";
import { useState, useTransition } from "react";
import { confirmExtraction, reextract } from "@/app/admin/actions";

type Row = { id: string; rawLabel: string; period: string | null; amount: number | null; lineItem: string | null; channel: string | null; unitId: string | null; confidence: number | null; decision: string };
const LINES = ["revenue", "cogs", "labour", "rent", "delivery_commission", "marketing", "utilities", "maintenance", "other_opex", "head_office", "depreciation", "interest", "tax"];
const CH = ["dine_in", "delivery", "wholesale", "online"];

export default function ExtractionReview({ engagementId, upload, rows: initial, units }: { engagementId: string; upload: { id: string; filename: string; status: string; note: string | null; createdAt: string; by: string }; rows: Row[]; units: { id: string; name: string }[] }) {
  const [rows, setRows] = useState(initial.map((r) => ({ ...r, accept: r.decision === "accept" || (r.decision === "pending" && !!r.lineItem && (r.confidence ?? 0) >= 0.7) })));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const set = (id: string, p: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h3 style={{ margin: 0 }}>{upload.filename}</h3>
          <p className="muted" style={{ margin: 0 }}>Uploaded {upload.createdAt.slice(0, 10)} by {upload.by}. <span className="tag">{upload.status}</span> {upload.note}</p>
        </div>
        <button className="btn secondary small" disabled={pending} onClick={() => start(async () => { await reextract(engagementId, upload.id); location.reload(); })}>Re-run extraction</button>
      </div>
      {rows.length > 0 && (
        <>
          <div className="table-wrap" style={{ maxHeight: 520 }}>
            <table>
              <thead>
                <tr><th>Use</th><th>Label in file</th><th>Month</th><th className="n">Amount</th><th>Line item</th><th>Channel</th><th>Unit</th><th className="n">Confidence</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><input type="checkbox" aria-label="Use this figure" checked={r.accept} onChange={(e) => set(r.id, { accept: e.target.checked })} /></td>
                    <td>{r.rawLabel}</td>
                    <td><input aria-label="Month" type="month" value={r.period?.slice(0, 7) ?? ""} onChange={(e) => set(r.id, { period: e.target.value ? `${e.target.value}-01` : null })} /></td>
                    <td><input aria-label="Amount" className="num" value={r.amount ?? ""} onChange={(e) => set(r.id, { amount: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                    <td>
                      <select aria-label="Line item" value={r.lineItem ?? ""} onChange={(e) => set(r.id, { lineItem: e.target.value || null })}>
                        <option value="">Unmapped</option>
                        {LINES.map((l) => <option key={l} value={l}>{l.replace(/_/g, " ")}</option>)}
                      </select>
                    </td>
                    <td>
                      <select aria-label="Channel" value={r.channel ?? ""} disabled={r.lineItem !== "revenue"} onChange={(e) => set(r.id, { channel: e.target.value || null })}>
                        <option value="">–</option>
                        {CH.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
                      </select>
                    </td>
                    <td>
                      <select aria-label="Unit" value={r.unitId ?? ""} disabled={r.lineItem === "head_office"} onChange={(e) => set(r.id, { unitId: e.target.value || null })}>
                        <option value="">Choose…</option>
                        {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </td>
                    <td className="n">{r.confidence === null ? "–" : `${Math.round(r.confidence * 100)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button className="btn" disabled={pending} onClick={() => start(async () => {
              const res = await confirmExtraction(engagementId, upload.id, rows.map((r) => ({ id: r.id, accept: r.accept, lineItem: r.lineItem, channel: r.channel, unitId: r.unitId, period: r.period, amount: r.amount })));
              setMsg(res.ok ? `${res.written} figures written to the intake grid.` : (res.error ?? "Failed"));
            })}>Confirm selected figures</button>
            <span className="muted">{rows.filter((r) => r.accept).length} of {rows.length} selected. Depreciation, interest and tax are kept for reference only.</span>
          </div>
          {msg && <p className="notice ok">{msg}</p>}
        </>
      )}
    </div>
  );
}
