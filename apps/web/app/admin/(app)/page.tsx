import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { client, db, engagement, intakeSection, valuationRun } from "@/lib/db";
import { createEngagement } from "../actions";
import { SECTIONS } from "@/lib/intake/sections";
import { egpM } from "@/lib/format";
import type { EngineResult } from "@valuation/engine";

export const metadata = { title: "Engagements" };

const STATUS: Record<string, string> = {
  draft: "Draft",
  intake_open: "Intake open",
  submitted: "Intake submitted",
  in_review: "In review",
  provisional: "Provisional",
  final: "Final",
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const rows = await db()
    .select({ e: engagement, c: client })
    .from(engagement)
    .innerJoin(client, eq(client.id, engagement.clientId))
    .orderBy(desc(engagement.updatedAt));
  const comp = await db()
    .select({ id: intakeSection.engagementId, total: sql<number>`sum(${intakeSection.completionPct})` })
    .from(intakeSection)
    .where(sql`${intakeSection.sectionKey} <> 'uploads'`)
    .groupBy(intakeSection.engagementId);
  const runs = await db()
    .selectDistinctOn([valuationRun.engagementId], { id: valuationRun.engagementId, result: valuationRun.result, at: valuationRun.createdAt })
    .from(valuationRun)
    .orderBy(valuationRun.engagementId, desc(valuationRun.createdAt));
  const counted = SECTIONS.filter((s) => s.key !== "uploads").length;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Engagements</h1>
          <p className="muted">One engine, a new client file each time.</p>
        </div>
      </div>
      {e && <p className="notice bad">{e}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Engagement</th>
              <th>Status</th>
              <th className="n">Intake</th>
              <th className="n">Latest mid value</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ e, c }) => {
              const pct = Math.round(Number(comp.find((x) => x.id === e.id)?.total ?? 0) / counted);
              const run = runs.find((r) => r.id === e.id);
              const res = run?.result as EngineResult | undefined;
              return (
                <tr key={e.id}>
                  <td>
                    <Link href={`/admin/engagements/${e.id}`}>{c.name}</Link> {c.isDemo && <span className="tag info">Demo</span>}
                  </td>
                  <td>{e.title}</td>
                  <td>
                    <span className={`tag ${e.status === "final" ? "ok" : e.status === "provisional" ? "warn" : ""}`}>{STATUS[e.status]}</span>
                  </td>
                  <td className="n">{pct}%</td>
                  <td className="n">{res ? egpM(res.reconciliation.roundedMid) : "–"}</td>
                  <td>{e.updatedAt.toISOString().slice(0, 10)}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="empty">No engagements yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ marginTop: 24, maxWidth: 760 }}>
        <h2>New engagement</h2>
        <form action={createEngagement} className="grid2">
          <div className="field">
            <label htmlFor="client" className="req">Client (brand) name</label>
            <input id="client" name="client" required />
          </div>
          <div className="field">
            <label htmlFor="title">Engagement title</label>
            <input id="title" name="title" placeholder="Advisory valuation" />
          </div>
          <div className="field">
            <label htmlFor="purpose">Purpose</label>
            <input id="purpose" name="purpose" placeholder="Fundraising, sale, partner buy-out…" />
          </div>
          <div className="field">
            <label htmlFor="valuation_date">Valuation date</label>
            <input id="valuation_date" name="valuation_date" type="date" />
          </div>
          <div className="field">
            <label htmlFor="fee">Fee (USD)</label>
            <input id="fee" name="fee" inputMode="decimal" />
          </div>
          <div className="field">
            <label htmlFor="segment">Segment</label>
            <input id="segment" name="segment" placeholder="Specialty coffee" />
          </div>
          <div>
            <button className="btn" type="submit">Create engagement</button>
          </div>
        </form>
      </div>
    </>
  );
}
