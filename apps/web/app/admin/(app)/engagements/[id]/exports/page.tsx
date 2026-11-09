import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db, exportFile, valuationRun } from "@/lib/db";
import { EXPORT_TYPES } from "@/lib/runs";
import { runValuationAction } from "@/app/admin/actions";
import { egpM } from "@/lib/format";
import type { EngineResult } from "@valuation/engine";

export default async function Exports({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const runs = await db().select().from(valuationRun).where(eq(valuationRun.engagementId, id)).orderBy(desc(valuationRun.createdAt)).limit(20);
  const files = runs.length ? await db().select().from(exportFile).where(inArray(exportFile.runId, runs.map((r) => r.id))).orderBy(desc(exportFile.createdAt)) : [];
  const save = runValuationAction.bind(null, id);
  return (
    <div className="stack">
      <div className="panel">
        <div className="spread">
          <div>
            <h2 style={{ margin: 0 }}>Exports</h2>
            <p className="muted" style={{ margin: 0 }}>Every file is generated from one saved run, so the Excel model, report and deck always agree. Before sending anything, work through the <Link href="/admin/checklist">pre-send checklist</Link>.</p>
          </div>
          <form action={save}><button className="btn secondary">Save a new run</button></form>
        </div>
      </div>
      {!runs.length && <div className="panel empty">No saved runs yet. Save a run from the Valuation tab first.</div>}
      {runs.map((r, i) => {
        const res = r.result as EngineResult;
        const fs = files.filter((f) => f.runId === r.id);
        return (
          <div className="panel" key={r.id}>
            <div className="spread">
              <div>
                <strong>{i === 0 ? "Latest run" : "Run"} · {r.createdAt.toISOString().slice(0, 16).replace("T", " ")}</strong>{" "}
                <span className={`tag ${r.status === "final" ? "ok" : "warn"}`}>{r.status === "final" ? "Final" : "Provisional"}</span>
                <div className="muted">
                  {egpM(res.reconciliation.roundedLow)} to {egpM(res.reconciliation.roundedHigh)} (mid {egpM(res.reconciliation.roundedMid)}) · engine {r.engineVersion} · input hash <span className="mono">{r.inputHash.slice(0, 12)}</span> · by {r.createdBy}
                </div>
              </div>
              <div className="row">
                {(Object.keys(EXPORT_TYPES) as (keyof typeof EXPORT_TYPES)[]).map((k) => (
                  <a key={k} className="btn small secondary" href={`/api/admin/runs/${r.id}/export/${k}`}>{EXPORT_TYPES[k].label}</a>
                ))}
              </div>
            </div>
            {fs.length > 0 && (
              <p className="faint" style={{ marginBottom: 0, marginTop: 8 }}>
                Generated: {fs.map((f) => `${f.kind} ${f.createdAt.toISOString().slice(0, 16).replace("T", " ")} (sha256 ${f.checksum.slice(0, 10)})`).join(" · ")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
