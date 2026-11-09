"use client";
import { useState, useTransition } from "react";
import { acceptProposal, rejectProposal, runResearch } from "@/app/admin/actions";

export type Proposal = {
  id: string;
  kind: string;
  targetKey: string | null;
  label: string;
  value: string;
  asOf: string | null;
  quote: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  publisher: string | null;
};

export default function ResearchPanel({ engagementId, kind, proposals, enabled }: { engagementId: string; kind: "macro" | "comparables"; proposals: Proposal[]; enabled: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="panel">
      <div className="spread">
        <div>
          <h2 style={{ margin: 0 }}>{kind === "macro" ? "Live macro data" : "Comparable research"}</h2>
          <p className="muted" style={{ margin: 0 }}>
            Searches the web now. Only figures stated by a source that the search actually returned are proposed; nothing is used until you accept it.
          </p>
        </div>
        <button className="btn" disabled={pending || !enabled} onClick={() => start(async () => {
          setMsg("Searching… this can take a few minutes.");
          const r = await runResearch(engagementId, kind);
          setMsg(r.ok ? `${r.created} proposals found.${r.rejected.length ? ` Not proposed: ${r.rejected.join("; ")}.` : ""}` : r.error);
        })}>
          {pending ? "Searching…" : kind === "macro" ? "Fetch macro data" : "Search comparables"}
        </button>
      </div>
      {!enabled && <p className="notice" style={{ marginTop: 12 }}>Live research needs ANTHROPIC_API_KEY in the Vercel environment variables. Until then, enter values with a source by hand.</p>}
      {msg && <p className="notice" style={{ marginTop: 12 }}>{msg}</p>}
      {proposals.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table>
            <thead><tr><th>Item</th><th className="n">Value</th><th>Source</th><th>Quote</th><th /></tr></thead>
            <tbody>
              {proposals.map((p) => (
                <tr key={p.id}>
                  <td>{p.label}</td>
                  <td className="n">{p.value}</td>
                  <td>
                    {p.sourceUrl ? <a href={p.sourceUrl} target="_blank" rel="noreferrer noopener">{p.sourceTitle}</a> : p.sourceTitle}
                    <div className="faint">{[p.publisher, p.asOf].filter(Boolean).join(", ")}</div>
                  </td>
                  <td style={{ maxWidth: 360 }}><span className="muted">{p.quote}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn small" disabled={pending} onClick={() => start(() => acceptProposal(p.id))}>Accept</button>{" "}
                    <button className="btn small secondary" disabled={pending} onClick={() => start(() => rejectProposal(p.id))}>Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
