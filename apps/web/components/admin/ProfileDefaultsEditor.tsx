"use client";
import { useState, useTransition } from "react";
import { saveProfileDefault } from "@/app/admin/actions";

export type DefaultRow = { key: string; label: string; unit: string; builtIn: number | null; edited: number | null; group: string };

const show = (v: number | null, unit: string) => (v === null ? "" : unit === "pct" ? String(+(v * 100).toFixed(4)) : String(v));
const parse = (t: string, unit: string) => {
  const n = Number(t.replace(/,/g, ""));
  return t.trim() === "" || !Number.isFinite(n) ? null : unit === "pct" ? n / 100 : n;
};

export default function ProfileDefaultsEditor({ profileKey, rows }: { profileKey: string; rows: DefaultRow[] }) {
  const groups = [...new Set(rows.map((r) => r.group))];
  return (
    <div className="stack">
      {groups.map((g) => (
        <div key={g}>
          <h3>{g}</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Assumption</th><th className="n">Built-in</th><th className="n">Your default</th><th /></tr></thead>
              <tbody>
                {rows.filter((r) => r.group === g).map((r) => <Row key={r.key} profileKey={profileKey} r={r} />)}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function Row({ profileKey, r }: { profileKey: string; r: DefaultRow }) {
  const [val, setVal] = useState(show(r.edited, r.unit));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const u = r.unit === "pct" ? "%" : r.unit === "x" ? "x" : "";
  return (
    <tr>
      <td>{r.label}<div className="faint mono">{r.key}</div></td>
      <td className="n">{r.builtIn === null ? "–" : `${show(r.builtIn, r.unit)}${u}`}</td>
      <td className="n" style={{ width: 160 }}>
        <input aria-label={`Default for ${r.label}`} className="num blue" value={val} placeholder="built-in" onChange={(e) => setVal(e.target.value)} />
      </td>
      <td style={{ whiteSpace: "nowrap" }}>
        <button className="btn small" disabled={pending} onClick={() => start(async () => { const res = await saveProfileDefault(profileKey, r.key, parse(val, r.unit)); setMsg(res.ok ? "Saved" : (res.error ?? "Error")); })}>Save</button>{" "}
        {r.edited !== null && <button className="btn small secondary" disabled={pending} onClick={() => start(async () => { await saveProfileDefault(profileKey, r.key, null); setVal(""); setMsg("Reset"); })}>Reset</button>}
        {msg && <span className="faint" style={{ marginLeft: 6 }}>{msg}</span>}
      </td>
    </tr>
  );
}
