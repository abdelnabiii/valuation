"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CAPEX_CATEGORIES, DEBT_KINDS, UNIT_FORMATS, type Field, type SectionDef } from "@/lib/intake/sections";
import type { IntakeConfig } from "@/lib/intake/config";
import {
  cellKey,
  checks as runChecks,
  completion as computeCompletion,
  monthsWindow,
  type AddbackRow,
  type CapexRow,
  type DebtRow,
  type IntakeState,
  type LeaseRow,
  type UnitRow,
} from "@/lib/intake/types";

type Props = {
  config: IntakeConfig;
  initial: IntakeState;
  saveUrl: string;
  uploadUrl: string;
  submitUrl?: string;
  locked?: boolean;
  mode: "client" | "admin";
};

const uid = () => crypto.randomUUID();

export default function IntakeForm({ config, initial, saveUrl, uploadUrl, submitUrl, locked = false, mode }: Props) {
  const SECTIONS = config.sections;
  const [state, setState] = useState<IntakeState>(initial);
  const [active, setActive] = useState<string>(SECTIONS[0]!.key);
  const [saving, setSaving] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(locked);
  const pending = useRef<Record<string, Record<string, unknown>>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const comp = useMemo(() => computeCompletion(state, config), [state, config]);
  const issues = useMemo(() => runChecks(state, config), [state, config]);
  const readOnly = submitted && mode === "client";

  const flush = useCallback(async () => {
    const batch = pending.current;
    pending.current = {};
    const keys = Object.keys(batch);
    if (!keys.length) return;
    setSaving("saving");
    try {
      for (const section of keys) {
        const res = await fetch(saveUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ section, data: batch[section] }),
        });
        if (!res.ok) throw new Error(await res.text());
      }
      setSaving("saved");
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch {
      // Put the batch back so nothing is lost; retry on next change or on demand.
      for (const [k, v] of Object.entries(batch)) pending.current[k] = { ...v, ...(pending.current[k] ?? {}) };
      setSaving("error");
    }
  }, [saveUrl]);

  const queue = useCallback(
    (section: string, data: Record<string, unknown>, merge?: (prev: Record<string, unknown>) => Record<string, unknown>) => {
      if (readOnly) return;
      const prev = pending.current[section] ?? {};
      pending.current[section] = merge ? merge(prev) : { ...prev, ...data };
      setSaving("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 900);
    },
    [flush, readOnly],
  );

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  const setFields = (section: string, patch: Record<string, unknown>) => {
    setState((s) => ({ ...s, sections: { ...s.sections, [section]: { ...(s.sections[section] ?? {}), ...patch } } }));
    queue(section, {}, (prev) => ({ ...prev, fields: { ...((prev.fields as object) ?? {}), ...patch } }));
  };

  const def = SECTIONS.find((s) => s.key === active)!;
  const sectionIssues = issues.filter((i) => i.section === active);
  const idx = SECTIONS.findIndex((s) => s.key === active);

  async function submit() {
    if (!submitUrl) return;
    await flush();
    if (!confirm("Submit the questionnaire? You will not be able to edit it afterwards unless your advisor reopens it.")) return;
    const res = await fetch(submitUrl, { method: "POST" });
    if (res.ok) setSubmitted(true);
  }

  return (
    <div className="intake-layout">
      <aside className="intake-nav">
        <div className="field">
          <div className="spread">
            <strong>Completion</strong>
            <span className="pct">{comp.overall}%</span>
          </div>
          <div className="progress" aria-label={`Overall completion ${comp.overall}%`}>
            <div style={{ width: `${comp.overall}%` }} />
          </div>
        </div>
        <nav>
          {SECTIONS.map((s, i) => {
            const p = comp.per.find((x) => x.key === s.key)!.pct;
            const n = issues.filter((x) => x.section === s.key).length;
            return (
              <a
                key={s.key}
                href={`#${s.key}`}
                aria-current={active === s.key}
                onClick={(e) => {
                  e.preventDefault();
                  setActive(s.key);
                  window.scrollTo({ top: 0 });
                }}
              >
                <span>
                  {i + 1}. {s.title}
                  {n > 0 && <span className="tag warn" style={{ marginLeft: 6 }}>{n}</span>}
                </span>
                <span className="pct">{p}%</span>
              </a>
            );
          })}
        </nav>
        <p className="save-state" style={{ marginTop: 12 }} aria-live="polite">
          {saving === "pending" && "Unsaved changes…"}
          {saving === "saving" && "Saving…"}
          {saving === "saved" && `All changes saved ${savedAt ?? ""}`}
          {saving === "error" && (
            <span style={{ color: "var(--bad)" }}>
              Could not save. <button className="btn small secondary" onClick={flush}>Retry</button>
            </span>
          )}
        </p>
        {mode === "client" && submitUrl && (
          <div style={{ marginTop: 16 }}>
            {submitted ? (
              <p className="notice ok">Submitted. Your advisor will be in touch.</p>
            ) : (
              <button className="btn" onClick={submit} disabled={comp.overall < 50}>
                Submit questionnaire
              </button>
            )}
            {!submitted && comp.overall < 50 && <p className="help faint" style={{ fontSize: 12 }}>Available once the form is at least half complete.</p>}
          </div>
        )}
      </aside>

      <section>
        <div className="panel">
          <h2>
            {idx + 1}. {def.title}
          </h2>
          <p className="muted">{def.intro}</p>
          {sectionIssues.length > 0 && (
            <div className="notice" style={{ marginBottom: 16 }}>
              <strong>Please check</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {sectionIssues.slice(0, 12).map((i) => (
                  <li key={i.key}>
                    {i.severity === "blocking" && <span className="tag bad" style={{ marginRight: 6 }}>Missing</span>}
                    {i.message}
                  </li>
                ))}
                {sectionIssues.length > 12 && <li>and {sectionIssues.length - 12} more.</li>}
              </ul>
            </div>
          )}
          <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
            <SectionEditor def={def} state={state} setState={setState} queue={queue} setFields={setFields} uploadUrl={uploadUrl} config={config} />
          </fieldset>
        </div>
        <div className="spread" style={{ marginTop: 16 }}>
          <button className="btn secondary" disabled={idx === 0} onClick={() => { setActive(SECTIONS[idx - 1]!.key); window.scrollTo({ top: 0 }); }}>
            Previous
          </button>
          <button className="btn secondary" disabled={idx === SECTIONS.length - 1} onClick={() => { flush(); setActive(SECTIONS[idx + 1]!.key); window.scrollTo({ top: 0 }); }}>
            Next section
          </button>
        </div>
      </section>
    </div>
  );
}

type EditorProps = {
  config: IntakeConfig;
  def: SectionDef;
  state: IntakeState;
  setState: React.Dispatch<React.SetStateAction<IntakeState>>;
  queue: (section: string, data: Record<string, unknown>, merge?: (p: Record<string, unknown>) => Record<string, unknown>) => void;
  setFields: (section: string, patch: Record<string, unknown>) => void;
  uploadUrl: string;
};

function SectionEditor(p: EditorProps) {
  switch (p.def.kind) {
    case "fields":
      return <FieldsEditor fields={p.def.fields ?? []} data={p.state.sections[p.def.key] ?? {}} onChange={(patch) => p.setFields(p.def.key, patch)} />;
    case "units":
      return <UnitsEditor {...p} />;
    case "financials":
      return <FinancialsEditor {...p} />;
    case "leases":
      return <LeasesEditor {...p} />;
    case "capex":
      return <CapexEditor {...p} />;
    case "owner":
      return <OwnerEditor {...p} />;
    case "debt":
      return <DebtEditor {...p} />;
    case "uploads":
      return <UploadsEditor {...p} />;
    case "assets":
      return <AssetsEditor {...p} />;
  }
}

/* ---------------- Generic fields ---------------- */

function toNum(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function FieldsEditor({ fields, data, onChange }: { fields: Field[]; data: Record<string, unknown>; onChange: (p: Record<string, unknown>) => void }) {
  return (
    <div className="grid2">
      {fields.map((f) => (
        <div className="field" key={f.key} style={f.type === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
          <label htmlFor={f.key} className={f.required ? "req" : undefined}>
            {f.label}
          </label>
          <FieldInput f={f} value={data[f.key]} onChange={(v) => onChange({ [f.key]: v })} />
          {f.help && <div className="help">{f.help}</div>}
        </div>
      ))}
    </div>
  );
}

function FieldInput({ f, value, onChange }: { f: Field; value: unknown; onChange: (v: unknown) => void }) {
  const v = value ?? "";
  switch (f.type) {
    case "textarea":
      return <textarea id={f.key} value={String(v)} onChange={(e) => onChange(e.target.value)} />;
    case "select":
      return (
        <select id={f.key} value={String(v)} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Select…</option>
          {f.options!.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "score":
      return (
        <select id={f.key} value={String(v)} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Select…</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      );
    case "date":
      return <input id={f.key} type="date" value={String(v)} onChange={(e) => onChange(e.target.value || null)} />;
    case "month":
      return <input id={f.key} type="month" value={String(v)} onChange={(e) => onChange(e.target.value || null)} />;
    case "pct":
      return (
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <NumInput id={f.key} value={typeof value === "number" ? value * 100 : null} onChange={(n) => onChange(n === null ? null : n / 100)} />
          <span className="muted">%</span>
        </div>
      );
    case "number":
    case "money":
      return <NumInput id={f.key} value={typeof value === "number" ? value : null} onChange={onChange} />;
    case "boolean":
      return <input id={f.key} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
    default:
      return <input id={f.key} type="text" value={String(v)} onChange={(e) => onChange(e.target.value)} />;
  }
}

function NumInput({ id, value, onChange, className, ariaLabel, onPasteRow }: { id?: string; value: number | null | undefined; onChange: (n: number | null) => void; className?: string; ariaLabel?: string; onPasteRow?: (vals: (number | null)[]) => void }) {
  const [text, setText] = useState(value === null || value === undefined ? "" : formatNum(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value === null || value === undefined ? "" : formatNum(value));
  }, [value]);
  return (
    <input
      id={id}
      aria-label={ariaLabel}
      className={`num ${className ?? ""}`}
      inputMode="decimal"
      value={text}
      onFocus={() => {
        focused.current = true;
        setText(value === null || value === undefined ? "" : String(value));
      }}
      onBlur={() => {
        focused.current = false;
        setText(value === null || value === undefined ? "" : formatNum(value));
      }}
      onChange={(e) => {
        setText(e.target.value);
        onChange(toNum(e.target.value));
      }}
      onPaste={(e) => {
        if (!onPasteRow) return;
        const t = e.clipboardData.getData("text");
        if (/[\t\n]/.test(t.trim())) {
          e.preventDefault();
          onPasteRow(t.trim().split(/[\t\n]+/).map((x) => toNum(x.replace(/[()]/g, (m) => (m === "(" ? "-" : "")))));
        }
      }}
    />
  );
}

function formatNum(n: number) {
  return Math.abs(n) >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(n);
}

/* ---------------- Units ---------------- */

function UnitsEditor({ state, setState, queue }: EditorProps) {
  const update = (units: UnitRow[]) => {
    setState((s) => ({ ...s, units }));
    queue("units", { units });
  };
  const set = (id: string, patch: Partial<UnitRow>) => update(state.units.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  return (
    <div className="stack">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Format</th>
              <th>City / area</th>
              <th>Opened</th>
              <th>Status</th>
              <th className="n">m²</th>
              <th className="n">Seats</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.units.map((u) => (
              <tr key={u.id}>
                <td><input aria-label="Unit name" value={u.name} onChange={(e) => set(u.id, { name: e.target.value })} /></td>
                <td>
                  <select aria-label="Format" value={u.format} onChange={(e) => set(u.id, { format: e.target.value })}>
                    {UNIT_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </td>
                <td><input aria-label="City" value={u.city ?? ""} onChange={(e) => set(u.id, { city: e.target.value || null })} /></td>
                <td><input aria-label="Opening date" type="date" value={u.openedOn ?? ""} onChange={(e) => set(u.id, { openedOn: e.target.value || null })} /></td>
                <td>
                  <select aria-label="Status" value={u.status} onChange={(e) => set(u.id, { status: e.target.value })}>
                    <option value="operating">Operating</option>
                    <option value="pre_opening">Pre-opening</option>
                    <option value="closed">Closed</option>
                  </select>
                </td>
                <td><NumInput ariaLabel="Area" value={u.sqm} onChange={(n) => set(u.id, { sqm: n })} /></td>
                <td><NumInput ariaLabel="Seats" value={u.seats} onChange={(n) => set(u.id, { seats: n })} /></td>
                <td>
                  <button className="btn small danger" onClick={() => confirm(`Remove ${u.name || "this unit"} and all its data?`) && update(state.units.filter((x) => x.id !== u.id))}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {!state.units.length && (
              <tr><td colSpan={8} className="empty">No units yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <button className="btn secondary" onClick={() => update([...state.units, { id: uid(), name: `Unit ${state.units.length + 1}`, format: "cafe", city: null, openedOn: null, status: "operating", sqm: null, seats: null }])}>
        Add unit
      </button>
    </div>
  );
}

/* ---------------- Financials ---------------- */

function FinancialsEditor({ def, state, setState, queue, setFields, config }: EditorProps) {
  const months = monthsWindow(state);
  const unitsModel = config.model === "units";
  const tabs = unitsModel
    ? [...state.units.filter((u) => u.status !== "closed").map((u) => ({ id: u.id, name: u.name })), { id: "ho", name: "Head office" }]
    : state.units.slice(0, 1).map((u) => ({ id: u.id, name: "Company" }));
  const [tab, setTab] = useState(tabs[0]?.id ?? "ho");
  const f = state.sections.financials ?? {};

  const setCells = (patch: Record<string, number | null>) => {
    setState((s) => {
      const fin = { ...s.financials };
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete fin[k];
        else fin[k] = v;
      }
      return { ...s, financials: fin };
    });
    queue("financials", {}, (prev) => ({ ...prev, cells: { ...((prev.cells as object) ?? {}), ...patch } }));
  };

  const rows =
    tab === "ho"
      ? [{ line: "head_office", channel: null as string | null, label: "Head-office costs (total)" }]
      : [
          ...config.channels.map((c) => ({ line: "revenue", channel: c.key as string | null, label: `Revenue: ${c.label}` })),
          ...config.costLines.map((c) => ({ line: c.key as string, channel: null as string | null, label: c.label })),
        ];

  const total = (m: string, filter: (line: string) => boolean) =>
    rows.filter((r) => filter(r.line)).reduce((a, r) => a + (state.financials[cellKey(tab, r.line, r.channel, m)] ?? 0), 0);

  return (
    <div className="stack">
      <FieldsEditor fields={def.fields ?? []} data={f} onChange={(p) => setFields("financials", p)} />
      <div className="row">
        <div className="field" style={{ width: 200 }}>
          <label htmlFor="end_month">Last month of data</label>
          <input id="end_month" type="month" value={(f.end_month as string) ?? months[months.length - 1]} onChange={(e) => setFields("financials", { end_month: e.target.value })} />
        </div>
        <div className="field" style={{ width: 160 }}>
          <label htmlFor="months_count">Months shown</label>
          <select id="months_count" value={String(f.months_count ?? 24)} onChange={(e) => setFields("financials", { months_count: Number(e.target.value) })}>
            {[6, 12, 18, 24].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>
      {!state.units.length && <p className="notice">Add {config.unitPlural} in section 3 first.</p>}
      {unitsModel && <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <a key={t.id} href="#" role="tab" aria-current={tab === t.id ? "page" : undefined} onClick={(e) => { e.preventDefault(); setTab(t.id); }}>
            {t.name}
          </a>
        ))}
      </div>}
      <p className="help muted" style={{ fontSize: 12 }}>
        Amounts in EGP. You can paste a row copied from Excel into the first month and it fills across.
      </p>
      <div className="table-wrap" style={{ maxHeight: 560 }}>
        <table className="grid-table">
          <thead>
            <tr>
              <th style={{ minWidth: 220, left: 0, position: "sticky", zIndex: 2 }}>Line</th>
              {months.map((m) => <th key={m} className="n">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.line + (r.channel ?? "")}>
                <td className="lbl" style={{ position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>{r.label}</td>
                {months.map((m, mi) => (
                  <td key={m}>
                    <NumInput
                      ariaLabel={`${r.label} ${m}`}
                      value={state.financials[cellKey(tab, r.line, r.channel, m)]}
                      onChange={(n) => setCells({ [cellKey(tab, r.line, r.channel, m)]: n })}
                      onPasteRow={(vals) => {
                        const patch: Record<string, number | null> = {};
                        vals.forEach((v, i) => {
                          const mm = months[mi + i];
                          if (mm) patch[cellKey(tab, r.line, r.channel, mm)] = v;
                        });
                        setCells(patch);
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {tab !== "ho" && (
              <>
                <tr className="total">
                  <td className="lbl" style={{ position: "sticky", left: 0, background: "#fff" }}>Total revenue</td>
                  {months.map((m) => <td key={m} className="n" style={{ padding: "6px 8px" }}>{fmt0(total(m, (l) => l === "revenue"))}</td>)}
                </tr>
                <tr className="total">
                  <td className="lbl" style={{ position: "sticky", left: 0, background: "#fff" }}>Four-wall profit</td>
                  {months.map((m) => <td key={m} className="n" style={{ padding: "6px 8px" }}>{fmt0(total(m, (l) => l === "revenue") - total(m, (l) => l !== "revenue"))}</td>)}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const fmt0 = (n: number) => (n ? Math.round(n).toLocaleString("en-US") : "–");

/* ---------------- Leases ---------------- */

function LeasesEditor({ state, setState, queue, config }: EditorProps) {
  const set = (unitId: string, patch: Partial<LeaseRow>) => {
    const empty: LeaseRow = { yearsRemaining: null, monthlyRent: null, escalationPct: null, escalationEveryMonths: null, renewalRight: null, renewalTerms: null, deposit: null };
    const next = { ...(state.leases[unitId] ?? empty), ...patch };
    setState((s) => ({ ...s, leases: { ...s.leases, [unitId]: next } }));
    queue("leases", {}, (prev) => ({ ...prev, leases: { ...((prev.leases as object) ?? {}), [unitId]: next } }));
  };
  const units = state.units.filter((u) => u.status !== "closed");
  if (!units.length) return <p className="notice">Add {config.unitPlural} in section 3 first.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{config.model === "units" ? config.unitSingular.charAt(0).toUpperCase() + config.unitSingular.slice(1) : "Premises"}</th>
            <th className="n">Years left</th>
            <th className="n">Monthly rent (EGP)</th>
            <th className="n">Escalation %</th>
            <th className="n">Every (months)</th>
            <th>Renewal right</th>
            <th>Renewal terms</th>
            <th className="n">Deposit (EGP)</th>
          </tr>
        </thead>
        <tbody>
          {units.map((u) => {
            const l = state.leases[u.id];
            return (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td><NumInput ariaLabel="Years left" value={l?.yearsRemaining} onChange={(n) => set(u.id, { yearsRemaining: n })} /></td>
                <td><NumInput ariaLabel="Monthly rent" value={l?.monthlyRent} onChange={(n) => set(u.id, { monthlyRent: n })} /></td>
                <td><NumInput ariaLabel="Escalation" value={l?.escalationPct === null || l?.escalationPct === undefined ? null : l.escalationPct * 100} onChange={(n) => set(u.id, { escalationPct: n === null ? null : n / 100 })} /></td>
                <td><NumInput ariaLabel="Escalation frequency" value={l?.escalationEveryMonths} onChange={(n) => set(u.id, { escalationEveryMonths: n })} /></td>
                <td>
                  <select aria-label="Renewal right" value={l?.renewalRight === null || l?.renewalRight === undefined ? "" : l.renewalRight ? "yes" : "no"} onChange={(e) => set(u.id, { renewalRight: e.target.value === "" ? null : e.target.value === "yes" })}>
                    <option value="">Select…</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </td>
                <td><input aria-label="Renewal terms" value={l?.renewalTerms ?? ""} onChange={(e) => set(u.id, { renewalTerms: e.target.value || null })} /></td>
                <td><NumInput ariaLabel="Deposit" value={l?.deposit} onChange={(n) => set(u.id, { deposit: n })} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Capex ---------------- */

function CapexEditor({ state, setState, queue, config }: EditorProps) {
  const update = (capex: CapexRow[]) => {
    setState((s) => ({ ...s, capex }));
    queue("capex", { capex });
  };
  const set = (id: string, patch: Partial<CapexRow>) => update(state.capex.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const units = state.units;
  if (!units.length) return <p className="notice">Add {config.unitPlural} in section 3 first.</p>;
  return (
    <div className="stack">
      {units.map((u) => {
        const rows = state.capex.filter((c) => c.unitId === u.id);
        const tot = rows.reduce((a, r) => a + (r.cost ?? 0), 0);
        return (
          <div key={u.id}>
            <div className="spread">
              <h3 style={{ margin: 0 }}>{config.model === "units" ? u.name : "Company fixed assets"}</h3>
              <span className="muted">Total EGP {fmt0(tot)}</span>
            </div>
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Description</th>
                    <th className="n">Cost (EGP)</th>
                    <th>Date</th>
                    <th>Imported</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <select aria-label="Category" value={c.category} onChange={(e) => set(c.id, { category: e.target.value })}>
                          {CAPEX_CATEGORIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td><input aria-label="Description" value={c.description ?? ""} onChange={(e) => set(c.id, { description: e.target.value || null })} /></td>
                      <td><NumInput ariaLabel="Cost" value={c.cost} onChange={(n) => set(c.id, { cost: n })} /></td>
                      <td><input aria-label="Date" type="date" value={c.spentOn ?? ""} onChange={(e) => set(c.id, { spentOn: e.target.value || null })} /></td>
                      <td><input aria-label="Imported" type="checkbox" checked={c.imported} onChange={(e) => set(c.id, { imported: e.target.checked })} /></td>
                      <td><button className="btn small danger" onClick={() => update(state.capex.filter((x) => x.id !== c.id))}>Remove</button></td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan={6} className="empty">No capex recorded.</td></tr>}
                </tbody>
              </table>
            </div>
            <button className="btn small secondary" style={{ marginTop: 8 }} onClick={() => update([...state.capex, { id: uid(), unitId: u.id, category: "equipment", description: null, cost: null, spentOn: null, imported: false }])}>
              Add item
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Owner pay and one-offs ---------------- */

const ADDBACK_KINDS = [
  { value: "owner_pay", label: "Owner salary or drawings" },
  { value: "one_off", label: "One-off cost" },
  { value: "related_party", label: "Related-party cost above market" },
  { value: "non_operating", label: "Non-operating cost" },
];

function OwnerEditor({ state, setState, queue, setFields }: EditorProps) {
  const update = (addbacks: AddbackRow[]) => {
    setState((s) => ({ ...s, addbacks }));
    queue("owner", {}, (prev) => ({ ...prev, addbacks }));
  };
  const set = (id: string, patch: Partial<AddbackRow>) => update(state.addbacks.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const none = Boolean(state.sections.owner?.none_confirmed);
  return (
    <div className="stack">
      <p className="muted">List amounts for the last twelve months that are included in the costs you entered. Owner pay is replaced by a market-rate manager salary in the valuation.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Description</th>
              <th className="n">Amount, last 12 months (EGP)</th>
              <th>Recurring</th>
              <th>Evidence</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.addbacks.map((a) => (
              <tr key={a.id}>
                <td>
                  <select aria-label="Type" value={a.kind} onChange={(e) => set(a.id, { kind: e.target.value as AddbackRow["kind"] })}>
                    {ADDBACK_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </td>
                <td><input aria-label="Description" value={a.description} onChange={(e) => set(a.id, { description: e.target.value })} /></td>
                <td><NumInput ariaLabel="Amount" value={a.amount} onChange={(n) => set(a.id, { amount: n })} /></td>
                <td><input aria-label="Recurring" type="checkbox" checked={a.recurring} onChange={(e) => set(a.id, { recurring: e.target.checked })} /></td>
                <td><input aria-label="Evidence" value={a.evidenceNote ?? ""} onChange={(e) => set(a.id, { evidenceNote: e.target.value || null })} placeholder="Invoice, payslip…" /></td>
                <td><button className="btn small danger" onClick={() => update(state.addbacks.filter((x) => x.id !== a.id))}>Remove</button></td>
              </tr>
            ))}
            {!state.addbacks.length && <tr><td colSpan={6} className="empty">Nothing listed.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="row">
        <button className="btn secondary" onClick={() => update([...state.addbacks, { id: uid(), kind: "owner_pay", description: "", amount: null, recurring: true, evidenceNote: null }])}>
          Add item
        </button>
        <label className="row" style={{ fontWeight: 400, margin: 0 }}>
          <input type="checkbox" checked={none} onChange={(e) => setFields("owner", { none_confirmed: e.target.checked })} /> The owners take no pay and there are no one-off items
        </label>
      </div>
    </div>
  );
}

/* ---------------- Debt ---------------- */

function DebtEditor({ state, setState, queue, setFields }: EditorProps) {
  const update = (debt: DebtRow[]) => {
    setState((s) => ({ ...s, debt }));
    queue("debt", {}, (prev) => ({ ...prev, debt }));
  };
  const set = (id: string, patch: Partial<DebtRow>) => update(state.debt.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  return (
    <div className="stack">
      <p className="muted">Include cash in bank, all loans, overdrafts and rent deposits. Balances at the valuation date.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Counterparty</th>
              <th className="n">Balance</th>
              <th>Currency</th>
              <th className="n">Rate %</th>
              <th>Maturity</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.debt.map((d) => (
              <tr key={d.id}>
                <td>
                  <select aria-label="Type" value={d.kind} onChange={(e) => set(d.id, { kind: e.target.value })}>
                    {DEBT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </td>
                <td><input aria-label="Counterparty" value={d.counterparty ?? ""} onChange={(e) => set(d.id, { counterparty: e.target.value || null })} /></td>
                <td><NumInput ariaLabel="Balance" value={d.balance} onChange={(n) => set(d.id, { balance: n })} /></td>
                <td>
                  <select aria-label="Currency" value={d.currency} onChange={(e) => set(d.id, { currency: e.target.value })}>
                    <option value="EGP">EGP</option>
                    <option value="USD">USD</option>
                  </select>
                </td>
                <td><NumInput ariaLabel="Rate" value={d.ratePct === null ? null : d.ratePct * 100} onChange={(n) => set(d.id, { ratePct: n === null ? null : n / 100 })} /></td>
                <td><input aria-label="Maturity" type="date" value={d.maturity ?? ""} onChange={(e) => set(d.id, { maturity: e.target.value || null })} /></td>
                <td><button className="btn small danger" onClick={() => update(state.debt.filter((x) => x.id !== d.id))}>Remove</button></td>
              </tr>
            ))}
            {!state.debt.length && <tr><td colSpan={7} className="empty">Nothing listed.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="row">
        <button className="btn secondary" onClick={() => update([...state.debt, { id: uid(), kind: "cash", counterparty: null, balance: null, currency: "EGP", ratePct: null, maturity: null }])}>
          Add balance
        </button>
        <label className="row" style={{ fontWeight: 400, margin: 0 }}>
          <input type="checkbox" checked={Boolean(state.sections.debt?.none_confirmed)} onChange={(e) => setFields("debt", { none_confirmed: e.target.checked })} /> No debt, deposits or cash to report
        </label>
      </div>
    </div>
  );
}

/* ---------------- Uploads ---------------- */

function UploadsEditor({ state, setState, uploadUrl }: EditorProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function onFile(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setErr(null);
    try {
      for (const file of Array.from(files)) {
        const okType = /\.(xlsx|xls|pdf|csv)$/i.test(file.name);
        if (!okType) throw new Error(`${file.name}: only Excel, CSV or PDF files.`);
        if (file.size > 15 * 1024 * 1024) throw new Error(`${file.name}: larger than 15 MB.`);
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(uploadUrl, { method: "POST", body: fd });
        if (!res.ok) throw new Error(await res.text());
        const row = await res.json();
        setState((s) => ({ ...s, uploads: [...s.uploads, row] }));
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="pl-upload">P&L files (Excel, CSV or PDF, up to 15 MB each)</label>
        <input id="pl-upload" type="file" multiple accept=".xlsx,.xls,.csv,.pdf" disabled={busy} onChange={(e) => onFile(e.target.files)} />
        <div className="help">Uploaded figures are extracted automatically and checked by your advisor before they are used.</div>
      </div>
      {busy && <p className="muted">Uploading…</p>}
      {err && <p className="notice bad">{err}</p>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>File</th><th>Status</th><th>Uploaded</th></tr></thead>
          <tbody>
            {state.uploads.map((u) => (
              <tr key={u.id}><td>{u.filename}</td><td><span className="tag">{u.status}</span></td><td>{u.createdAt.slice(0, 10)}</td></tr>
            ))}
            {!state.uploads.length && <tr><td colSpan={3} className="empty">No files yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Properties and major assets (asset-heavy) ---------------- */

type AssetRow = { id: string; name: string; kind: string; market_value: number | null; book_value: number | null; valuer: string | null; valuation_date: string | null };

const ASSET_KINDS = [
  { value: "building", label: "Building" },
  { value: "land", label: "Land" },
  { value: "investment_property", label: "Investment property" },
  { value: "hotel", label: "Hotel / resort" },
  { value: "equipment", label: "Major equipment" },
  { value: "other", label: "Other" },
];

function AssetsEditor({ state, setFields }: EditorProps) {
  const rows = ((state.sections.assets?.rows as AssetRow[] | undefined) ?? []).map((r) => ({ ...r }));
  const update = (next: AssetRow[]) => setFields("assets", { rows: next });
  const set = (id: string, patch: Partial<AssetRow>) => update(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <div className="stack">
      <p className="muted">Market values should come from a recent independent appraisal. Book values are for reference only.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Asset</th><th>Type</th><th className="n">Market value (EGP)</th><th className="n">Book value (EGP)</th><th>Valued by</th><th>Valuation date</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><input aria-label="Asset" value={r.name} onChange={(e) => set(r.id, { name: e.target.value })} /></td>
                <td>
                  <select aria-label="Type" value={r.kind} onChange={(e) => set(r.id, { kind: e.target.value })}>
                    {ASSET_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </td>
                <td><NumInput ariaLabel="Market value" value={r.market_value} onChange={(n) => set(r.id, { market_value: n })} /></td>
                <td><NumInput ariaLabel="Book value" value={r.book_value} onChange={(n) => set(r.id, { book_value: n })} /></td>
                <td><input aria-label="Valued by" value={r.valuer ?? ""} onChange={(e) => set(r.id, { valuer: e.target.value || null })} /></td>
                <td><input aria-label="Valuation date" type="date" value={r.valuation_date ?? ""} onChange={(e) => set(r.id, { valuation_date: e.target.value || null })} /></td>
                <td><button className="btn small danger" onClick={() => update(rows.filter((x) => x.id !== r.id))}>Remove</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="empty">No assets listed.</td></tr>}
          </tbody>
        </table>
      </div>
      <button className="btn secondary" onClick={() => update([...rows, { id: uid(), name: "", kind: "building", market_value: null, book_value: null, valuer: null, valuation_date: null }])}>
        Add asset
      </button>
    </div>
  );
}
