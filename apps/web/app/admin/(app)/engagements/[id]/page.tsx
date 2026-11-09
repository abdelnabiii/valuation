import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, engagement, intakeLink } from "@/lib/db";
import { loadIntake } from "@/lib/intake/server";
import { completion, checks } from "@/lib/intake/types";
import { latestRun } from "@/lib/runs";
import { updateEngagement } from "@/app/admin/actions";
import LinkPanel from "@/components/admin/LinkPanel";
import { egp, egpM } from "@/lib/format";
import type { EngineResult } from "@valuation/engine";

export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [e] = await db().select().from(engagement).where(eq(engagement.id, id));
  const [link] = await db().select().from(intakeLink).where(and(eq(intakeLink.engagementId, id), isNull(intakeLink.revokedAt))).orderBy(desc(intakeLink.createdAt)).limit(1);
  const state = await loadIntake(id);
  const comp = completion(state);
  const issues = checks(state);
  const run = await latestRun(id);
  const res = run?.result as EngineResult | undefined;
  const save = updateEngagement.bind(null, id);
  const active = !!link && link.expiresAt > new Date();
  return (
    <div className="stack">
      {res && (
        <div className="panel">
          <div className="spread">
            <h2 style={{ margin: 0 }}>Latest valuation</h2>
            <span className={`tag ${run!.status === "final" ? "ok" : "warn"}`}>{run!.status === "final" ? "Final" : "Provisional"}</span>
          </div>
          <div className="grid3" style={{ marginTop: 16 }}>
            <div className="kpi"><div className="l">Low</div><div className="v">{egpM(res.reconciliation.roundedLow)}</div></div>
            <div className="kpi"><div className="l">Mid</div><div className="v">{egpM(res.reconciliation.roundedMid)}</div></div>
            <div className="kpi"><div className="l">High</div><div className="v">{egpM(res.reconciliation.roundedHigh)}</div></div>
          </div>
          <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
            Equity value after adjustments, EGP. Run {run!.createdAt.toISOString().slice(0, 16).replace("T", " ")} by {run!.createdBy}.{" "}
            {res.openItems.filter((o) => !o.waived && o.severity === "blocking").length} blocking open items. <Link href={`/admin/engagements/${id}/valuation`}>View workings</Link>
          </p>
        </div>
      )}
      <div className="grid2">
        <div className="panel">
          <h2>Client intake</h2>
          <div className="spread"><span>Completion</span><strong>{comp.overall}%</strong></div>
          <div className="progress" style={{ margin: "6px 0 14px" }}><div style={{ width: `${comp.overall}%` }} /></div>
          <p className="muted">{issues.filter((i) => i.severity === "blocking").length} missing items, {issues.filter((i) => i.severity === "warning").length} items to check.</p>
          <LinkPanel id={id} active={active} locked={!!link?.locked} submittedAt={link?.submittedAt?.toISOString() ?? null} expiresAt={link?.expiresAt.toISOString() ?? null} lastSavedAt={link?.lastSavedAt?.toISOString() ?? null} />
        </div>
        <div className="panel">
          <h2>Engagement settings</h2>
          <form action={save}>
            <div className="grid2">
              <div className="field"><label htmlFor="title">Title</label><input id="title" name="title" defaultValue={e!.title} /></div>
              <div className="field"><label htmlFor="valuation_date">Valuation date</label><input id="valuation_date" name="valuation_date" type="date" defaultValue={e!.valuationDate ?? ""} /></div>
              <div className="field"><label htmlFor="purpose">Purpose</label><input id="purpose" name="purpose" defaultValue={e!.purpose ?? ""} /></div>
              <div className="field"><label htmlFor="scope">Scope</label><input id="scope" name="scope" defaultValue={e!.scope ?? ""} placeholder="100% of equity" /></div>
              <div className="field">
                <label htmlFor="basis">Basis</label>
                <select id="basis" name="basis" defaultValue={e!.basis}><option value="control">Control</option><option value="minority">Minority</option></select>
              </div>
              <div className="field">
                <label htmlFor="discount_rate_method">Discount-rate method</label>
                <select id="discount_rate_method" name="discount_rate_method" defaultValue={e!.discountRateMethod}>
                  <option value="usd_buildup">USD build-up + inflation differential</option>
                  <option value="egp_tbill">EGP T-bill + premia (double-count warning)</option>
                </select>
              </div>
              <div className="field"><label htmlFor="fee">Fee</label><input id="fee" name="fee" defaultValue={e!.feeAmount ?? ""} inputMode="decimal" /></div>
              <div className="field"><label htmlFor="fee_currency">Fee currency</label><input id="fee_currency" name="fee_currency" defaultValue={e!.feeCurrency} /></div>
              <div className="field"><label htmlFor="presentation_currency">Presentation currency</label><input id="presentation_currency" name="presentation_currency" defaultValue={e!.presentationCurrency} /></div>
              <div className="field"><label htmlFor="cross_check_currency">Cross-check currency</label><input id="cross_check_currency" name="cross_check_currency" defaultValue={e!.crossCheckCurrency} /></div>
              <div className="field"><label htmlFor="language">Language</label><input id="language" name="language" defaultValue={e!.language} /></div>
              <div className="field"><label htmlFor="market">Market</label><input id="market" name="market" defaultValue={e!.market} /></div>
              <input type="hidden" name="standard_of_value" value={e!.standardOfValue} />
              <input type="hidden" name="premise" value={e!.premise} />
            </div>
            <button className="btn" type="submit">Save settings</button>
          </form>
          <p className="faint" style={{ fontSize: 12, marginTop: 12 }}>Fee {e!.feeAmount ? `${e!.feeCurrency} ${egp(Number(e!.feeAmount))}` : "not set"}. The model is always computed in nominal {e!.modelCurrency}.</p>
        </div>
      </div>
    </div>
  );
}
