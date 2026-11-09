"use client";

import { useState, useTransition } from "react";
import type { ResolvedAssumption } from "@valuation/engine";
import { addSource, clearAssumption, saveAssumption } from "@/app/admin/actions";

export type SourceOpt = { id: string; title: string; publisher: string | null; publishedDate: string | null; url: string | null };

const toDisplay = (v: number | null, unit: string) => (v === null ? "" : unit === "pct" ? String(+(v * 100).toFixed(6)) : String(v));
const fromDisplay = (s: string, unit: string) => {
  const t = s.replace(/,/g, "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return NaN;
  return unit === "pct" ? n / 100 : n;
};
const unitLabel: Record<string, string> = { pct: "%", egp: "EGP", x: "x", count: "units", egp_per_usd: "EGP/USD", ratio: "" };

function fmt(v: number | null, unit: string) {
  if (v === null) return "–";
  if (unit === "pct") return `${(v * 100).toFixed(2)}%`;
  if (unit === "x") return `${v.toFixed(2)}x`;
  if (unit === "egp") return Math.round(v).toLocaleString("en-US");
  if (unit === "egp_per_usd") return v.toFixed(4);
  return String(+v.toFixed(4));
}

const ORIGIN: Record<string, { label: string; cls: string }> = {
  input: { label: "Entered", cls: "info" },
  derived: { label: "Derived from client data", cls: "" },
  default: { label: "System default", cls: "warn" },
  missing: { label: "Missing", cls: "bad" },
};

export default function AssumptionTable({ engagementId, rows, sources }: { engagementId: string; rows: ResolvedAssumption[]; sources: SourceOpt[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th style={{ width: "36%" }}>Assumption</th>
            <th className="n">Value</th>
            <th>Status</th>
            <th>Source</th>
            <th>As of</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = sources.find((x) => x.id === r.sourceId);
            const o = ORIGIN[r.origin]!;
            return [
              <tr key={r.key} id={`a-${r.key}`}>
                <td>
                  {r.label}
                  <div className="faint mono">{r.key}</div>
                </td>
                <td className={`n ${r.origin === "input" ? "blue" : ""}`}>{fmt(r.value, r.unit)}</td>
                <td>
                  <span className={`tag ${o.cls}`}>{o.label}</span>{" "}
                  {r.value !== null && (r.confirmed ? <span className="tag ok">Confirmed</span> : <span className="tag warn">Unconfirmed</span>)}{" "}
                  {r.stale && <span className="tag bad">Older than 30 days</span>}
                </td>
                <td>
                  {s ? (
                    s.url ? <a href={s.url} target="_blank" rel="noreferrer noopener">{s.title}</a> : s.title
                  ) : r.requiresSource ? (
                    <span className="tag bad">Needs source</span>
                  ) : (
                    <span className="faint">Advisor judgement</span>
                  )}
                </td>
                <td>{r.asOf ?? "–"}</td>
                <td>
                  <button className="btn small secondary" onClick={() => setOpen(open === r.key ? null : r.key)}>{open === r.key ? "Close" : "Edit"}</button>
                </td>
              </tr>,
              open === r.key ? (
                <tr key={`${r.key}-edit`}>
                  <td colSpan={6} style={{ background: "#fafbfc" }}>
                    <Editor engagementId={engagementId} r={r} sources={sources} onDone={() => setOpen(null)} />
                  </td>
                </tr>
              ) : null,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

function Editor({ engagementId, r, sources, onDone }: { engagementId: string; r: ResolvedAssumption; sources: SourceOpt[]; onDone: () => void }) {
  const [val, setVal] = useState(toDisplay(r.value, r.unit));
  const [sourceId, setSourceId] = useState(r.sourceId ?? "");
  const [asOf, setAsOf] = useState(r.asOf ?? "");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [newSrc, setNewSrc] = useState(false);
  const [src, setSrc] = useState({ title: "", publisher: "", url: "", publishedDate: "", excerpt: "" });

  const save = (confirmed: boolean) =>
    start(async () => {
      setErr(null);
      const value = fromDisplay(val, r.unit);
      if (Number.isNaN(value)) return setErr("Enter a number.");
      let sid = sourceId || null;
      if (newSrc) {
        const res = await addSource(engagementId, {
          title: src.title,
          publisher: src.publisher || null,
          url: src.url || null,
          publishedDate: src.publishedDate || null,
          excerpt: src.excerpt || null,
          kind: r.section === "macro" ? "macro" : "method",
        });
        if (!res.ok) return setErr(res.error);
        sid = res.id;
        if (!asOf && src.publishedDate) setAsOf(src.publishedDate);
      }
      const res = await saveAssumption(engagementId, r.key, { value, sourceId: sid, asOf: asOf || (newSrc ? src.publishedDate : null) || null, confirmed, reason: reason || null });
      if (!res.ok) return setErr(res.error ?? "Could not save");
      onDone();
    });

  return (
    <div className="stack" style={{ padding: "8px 4px" }}>
      <div className="grid3">
        <div className="field">
          <label htmlFor={`v-${r.key}`}>Value {unitLabel[r.unit] ? `(${unitLabel[r.unit]})` : ""}</label>
          <input id={`v-${r.key}`} className="num blue" value={val} onChange={(e) => setVal(e.target.value)} inputMode="decimal" />
        </div>
        <div className="field">
          <label htmlFor={`s-${r.key}`}>Source{r.requiresSource ? " (required)" : ""}</label>
          <select id={`s-${r.key}`} value={newSrc ? "__new" : sourceId} onChange={(e) => (e.target.value === "__new" ? setNewSrc(true) : (setNewSrc(false), setSourceId(e.target.value)))}>
            <option value="">{r.requiresSource ? "Select a source…" : "None (advisor judgement)"}</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
                {s.publishedDate ? ` (${s.publishedDate})` : ""}
              </option>
            ))}
            <option value="__new">Add a new source…</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`d-${r.key}`}>As of</label>
          <input id={`d-${r.key}`} type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </div>
      </div>
      {newSrc && (
        <div className="grid2" style={{ borderLeft: "2px solid var(--accent)", paddingLeft: 12 }}>
          <div className="field"><label className="req">Title</label><input value={src.title} onChange={(e) => setSrc({ ...src, title: e.target.value })} /></div>
          <div className="field"><label>Publisher</label><input value={src.publisher} onChange={(e) => setSrc({ ...src, publisher: e.target.value })} /></div>
          <div className="field"><label>URL</label><input value={src.url} onChange={(e) => setSrc({ ...src, url: e.target.value })} placeholder="https://" /></div>
          <div className="field"><label className="req">Published / as-of date</label><input type="date" value={src.publishedDate} onChange={(e) => setSrc({ ...src, publishedDate: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: "1 / -1" }}><label>Quote from the source</label><textarea value={src.excerpt} onChange={(e) => setSrc({ ...src, excerpt: e.target.value })} /></div>
        </div>
      )}
      <div className="field">
        <label htmlFor={`r-${r.key}`}>Reason for change (recorded in the audit trail)</label>
        <input id={`r-${r.key}`} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {err && <p className="notice bad">{err}</p>}
      <div className="row">
        <button className="btn" disabled={pending} onClick={() => save(true)}>Save and confirm</button>
        <button className="btn secondary" disabled={pending} onClick={() => save(false)}>Save as draft</button>
        {r.origin === "input" && (
          <button className="btn danger" disabled={pending} onClick={() => confirm("Remove this entry and fall back to the derived or default value?") && start(async () => { await clearAssumption(engagementId, r.key); onDone(); })}>
            Remove entry
          </button>
        )}
      </div>
    </div>
  );
}
