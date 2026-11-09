"use client";
import { useState, useTransition } from "react";
import { addComparable, addSource, deleteComparable, setComparableIncluded } from "@/app/admin/actions";
import type { SourceOpt } from "./AssumptionTable";

type Comp = { id: string; name: string; kind: string; country: string | null; date: string | null; e: number | null; r: number | null; s: number | null; included: boolean; reason: string | null; sourceTitle: string; sourceUrl: string | null; sourceDate: string | null };

export default function ComparablesEditor({ engagementId, comps, sources }: { engagementId: string; comps: Comp[]; sources: SourceOpt[] }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [newSrc, setNewSrc] = useState(false);
  return (
    <div className="stack">
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Comparable</th><th>Type</th><th>Date</th><th className="n">EV/EBITDA</th><th className="n">EV/Revenue</th><th className="n">Price/SDE</th><th>Source</th><th>Included</th><th /></tr>
          </thead>
          <tbody>
            {comps.map((c) => (
              <tr key={c.id} style={c.included ? undefined : { color: "var(--faint)" }}>
                <td>{c.name}<div className="faint">{c.country}</div></td>
                <td>{c.kind}</td>
                <td>{c.date ?? "–"}</td>
                <td className="n blue">{c.e?.toFixed(2) ?? "–"}</td>
                <td className="n blue">{c.r?.toFixed(2) ?? "–"}</td>
                <td className="n blue">{c.s?.toFixed(2) ?? "–"}</td>
                <td>{c.sourceUrl ? <a href={c.sourceUrl} target="_blank" rel="noreferrer noopener">{c.sourceTitle}</a> : c.sourceTitle}<div className="faint">{c.sourceDate}</div></td>
                <td>
                  <input type="checkbox" aria-label="Included" checked={c.included} disabled={pending} onChange={(e) => {
                    const inc = e.target.checked;
                    const reason = inc ? null : prompt("Reason for excluding this comparable (recorded):");
                    if (!inc && !reason) return;
                    start(() => setComparableIncluded(engagementId, c.id, inc, reason));
                  }} />
                  {!c.included && c.reason && <div className="faint">{c.reason}</div>}
                </td>
                <td><button className="btn small danger" disabled={pending} onClick={() => confirm(`Delete ${c.name}?`) && start(() => deleteComparable(engagementId, c.id))}>Delete</button></td>
              </tr>
            ))}
            {!comps.length && <tr><td colSpan={9} className="empty">No comparables. The multiples method stays unavailable (and the valuation provisional) until sourced comparables are added.</td></tr>}
          </tbody>
        </table>
      </div>

      <form
        className="panel"
        action={(fd) =>
          start(async () => {
            setErr(null);
            if (newSrc) {
              const s = await addSource(engagementId, {
                title: String(fd.get("src_title") ?? ""),
                publisher: (fd.get("src_publisher") as string) || null,
                url: (fd.get("src_url") as string) || null,
                publishedDate: (fd.get("src_date") as string) || null,
                excerpt: (fd.get("src_quote") as string) || null,
                kind: fd.get("kind") === "listed" ? "listed" : "transaction",
              });
              if (!s.ok) return setErr(s.error);
              fd.set("source_id", s.id);
            }
            const r = await addComparable(engagementId, fd);
            if (!r.ok) setErr(r.error ?? "Could not add");
          })
        }
      >
        <h2>Add a comparable</h2>
        <p className="muted">Enter only multiples stated by the source, or computed from figures the source states. Every comparable must cite a dated source.</p>
        <div className="grid3">
          <div className="field"><label className="req" htmlFor="name">Name</label><input id="name" name="name" required /></div>
          <div className="field"><label htmlFor="kind">Type</label><select id="kind" name="kind"><option value="transaction">Transaction</option><option value="listed">Listed company</option></select></div>
          <div className="field"><label htmlFor="country">Country</label><input id="country" name="country" /></div>
          <div className="field"><label htmlFor="date">Deal / data date</label><input id="date" name="date" type="date" /></div>
          <div className="field"><label htmlFor="ev_ebitda">EV/EBITDA</label><input id="ev_ebitda" name="ev_ebitda" className="num" inputMode="decimal" /></div>
          <div className="field"><label htmlFor="ev_revenue">EV/Revenue</label><input id="ev_revenue" name="ev_revenue" className="num" inputMode="decimal" /></div>
          <div className="field"><label htmlFor="price_sde">Price/SDE</label><input id="price_sde" name="price_sde" className="num" inputMode="decimal" /></div>
          <div className="field" style={{ gridColumn: "span 2" }}>
            <label className="req" htmlFor="source_id">Source</label>
            <select id="source_id" name="source_id" onChange={(e) => setNewSrc(e.target.value === "__new")}>
              <option value="">Select…</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.title}{s.publishedDate ? ` (${s.publishedDate})` : ""}</option>)}
              <option value="__new">Add a new source…</option>
            </select>
          </div>
        </div>
        {newSrc && (
          <div className="grid2" style={{ borderLeft: "2px solid var(--accent)", paddingLeft: 12 }}>
            <div className="field"><label className="req">Source title</label><input name="src_title" required /></div>
            <div className="field"><label>Publisher</label><input name="src_publisher" /></div>
            <div className="field"><label>URL</label><input name="src_url" placeholder="https://" /></div>
            <div className="field"><label className="req">Published date</label><input name="src_date" type="date" required /></div>
            <div className="field" style={{ gridColumn: "1 / -1" }}><label>Quote stating the figures</label><textarea name="src_quote" /></div>
          </div>
        )}
        <div className="field"><label htmlFor="description">Notes</label><input id="description" name="description" /></div>
        {err && <p className="notice bad">{err}</p>}
        <button className="btn" disabled={pending} type="submit">Add comparable</button>
      </form>
    </div>
  );
}
