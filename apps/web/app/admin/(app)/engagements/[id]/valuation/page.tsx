import Link from "next/link";
import { footballFieldSvg, heatmapSvg, paletteFromBranding } from "@valuation/exports";
import type { ResolvedAssumption } from "@valuation/engine";
import { preview, latestRun } from "@/lib/runs";
import { sourceOptions } from "@/lib/sources";
import { getBranding } from "@/lib/branding";
import { runValuationAction } from "@/app/admin/actions";
import AssumptionTable from "@/components/admin/AssumptionTable";
import { egp, egpM, mult, pct } from "@/lib/format";

export const maxDuration = 60;

function Step({ n, title, children, intro }: { n: number; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="panel" id={`step-${n}`}>
      <h2>
        {n}. {title}
      </h2>
      {intro && <p className="muted">{intro}</p>}
      {children}
    </section>
  );
}

function KV({ rows }: { rows: [string, string, boolean?][] }) {
  return (
    <div className="table-wrap" style={{ marginBottom: 14 }}>
      <table>
        <tbody>
          {rows.map(([k, v, bold]) => (
            <tr key={k} className={bold ? "total" : undefined}>
              <td>{k}</td>
              <td className="n">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Assume({ id, all, sections, sources, keys }: { id: string; all: ResolvedAssumption[]; sections: string[]; sources: Awaited<ReturnType<typeof sourceOptions>>; keys?: (k: string) => boolean }) {
  const rows = all.filter((a) => a.relevant && sections.includes(a.section) && (!keys || keys(a.key)));
  if (!rows.length) return null;
  return (
    <details style={{ marginTop: 8 }}>
      <summary style={{ cursor: "pointer", fontWeight: 500, color: "var(--primary)" }}>Assumptions used in this step ({rows.length})</summary>
      <div style={{ marginTop: 10 }}>
        <AssumptionTable engagementId={id} rows={rows} sources={sources} />
      </div>
    </details>
  );
}

export default async function Valuation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { result: r, ttm, input } = await preview(id);
  const sources = await sourceOptions(id);
  const run = await latestRun(id);
  const b = await getBranding();
  const palette = paletteFromBranding(b);
  const save = runValuationAction.bind(null, id);
  const N = r.normalization;
  const U = r.unitEconomics;
  const D = r.dcf;
  const DR = r.discountRate;
  const M = r.multiples;
  const R = r.reconciliation;
  const blocking = r.openItems.filter((o) => o.severity === "blocking" && !o.waived);
  const ff = footballFieldSvg(r, palette, { width: 880 });
  const model = r.profile.model;
  const dcfWeight = R.methods.find((m) => m.method === "dcf")?.weight ?? 0;
  const showDcf = model !== "early_stage" || D.available || dcfWeight > 0;

  return (
    <div className="stack">
      <div className="panel">
        <div className="spread">
          <div>
            <h2 style={{ margin: 0 }}>Live calculation</h2>
            <p className="muted" style={{ margin: 0 }}>
              Profile: {r.profile.label}. Recalculated from the current inputs each time this page loads. TTM window {ttm ? `${ttm.from} to ${ttm.to}` : "not available"}; valuation date {input.meta.valuationDate}; {input.meta.monthsOfHistory} months of operating history.
            </p>
          </div>
          <form action={save}>
            <button className="btn" type="submit">Save as valuation run</button>
          </form>
        </div>
        {r.provisional ? (
          <p className="notice" style={{ marginTop: 12 }}>
            Provisional: {blocking.length} blocking open items. <Link href={`/admin/engagements/${id}/open-items`}>Review open items</Link>
          </p>
        ) : (
          <p className="notice ok" style={{ marginTop: 12 }}>No blocking open items. A saved run will be marked final.</p>
        )}
        {run && <p className="faint" style={{ marginBottom: 0 }}>Last saved run: {run.createdAt.toISOString().slice(0, 16).replace("T", " ")} ({run.status}).</p>}
        <div className="grid3" style={{ marginTop: 16 }}>
          <div className="kpi"><div className="l">Low</div><div className="v">{egpM(R.roundedLow)}</div></div>
          <div className="kpi"><div className="l">Mid</div><div className="v">{egpM(R.roundedMid)}</div></div>
          <div className="kpi"><div className="l">High</div><div className="v">{egpM(R.roundedHigh)}</div></div>
        </div>
      </div>

      <Step n={1} title="Normalize earnings" intro="Trailing twelve months. Owner pay and one-off items are added back; a market-rate manager salary is deducted.">
        <KV
          rows={[
            ["Revenue", egp(N.revenue)],
            ["Operating costs (incl. head office)", egp(N.totalCosts)],
            ["Reported EBITDA", egp(N.reportedEbitda), true],
            ["Reported margin", pct(N.reportedMargin)],
            ...N.addbacks.map((a): [string, string] => [`Add back: ${a.description} (${a.kind.replace("_", " ")})`, egp(a.amount)]),
            ["Seller's discretionary earnings (SDE)", egp(N.sde), true],
            ["Less: market-rate manager", egp(-N.marketManagerSalary)],
            ["Normalized EBITDA", egp(N.normalizedEbitda), true],
            ["Normalized margin", pct(N.normalizedMargin)],
          ]}
        />
        <Assume id={id} all={r.assumptions} sections={["normalization"]} sources={sources} />
      </Step>

      {model === "units" ? (
      <Step n={2} title="Unit economics" intro="Four-wall results per unit, before head-office costs.">
        <div className="table-wrap" style={{ marginBottom: 14 }}>
          <table>
            <thead>
              <tr><th>Unit</th><th className="n">Months open</th><th className="n">Sales</th><th className="n">Prime cost</th><th className="n">Rent</th><th className="n">Four-wall</th><th className="n">Margin</th><th className="n">Investment</th><th className="n">Payback</th></tr>
            </thead>
            <tbody>
              {U.rows.map((u) => (
                <tr key={u.id}>
                  <td>{u.name} {u.mature && <span className="tag">mature</span>}</td>
                  <td className="n">{u.monthsOpen ?? "–"}</td>
                  <td className="n">{egp(u.sales)}</td>
                  <td className="n">{pct(u.primeCostPct)}</td>
                  <td className="n">{pct(u.rentPct)}</td>
                  <td className="n">{egp(u.fourWallEbitda)}</td>
                  <td className="n">{pct(u.fourWallMargin)}</td>
                  <td className="n">{egp(u.investment)}</td>
                  <td className="n">{u.paybackYears === null ? "–" : `${u.paybackYears.toFixed(1)} yrs`}</td>
                </tr>
              ))}
              <tr className="total"><td>Total</td><td /><td className="n">{egp(U.totals.sales)}</td><td /><td /><td className="n">{egp(U.totals.fourWallEbitda)}</td><td className="n">{pct(U.totals.fourWallMargin)}</td><td className="n">{egp(U.totals.investment)}</td><td /></tr>
            </tbody>
          </table>
        </div>
        <KV
          rows={[
            ["New unit: mature annual sales (today's prices)", egp(U.newUnitMatureSales)],
            ["New unit: capex", egp(U.newUnitCapex)],
            ["New unit: four-wall margin", pct(U.newUnitFourWallMargin)],
            ["New unit: payback", U.newUnitPaybackYears === null ? "–" : `${U.newUnitPaybackYears.toFixed(1)} yrs`],
            ["Ramp-up: year 1 / year 2 of mature sales", `${pct(U.rampY1, 0)} / ${pct(U.rampY2, 0)}`],
            ["Observed year-1 ramp from history", U.observedRampY1 === null ? "not enough history" : pct(U.observedRampY1, 0)],
          ]}
        />
        <Assume id={id} all={r.assumptions} sections={["unit_economics"]} sources={sources} />
      </Step>
      ) : (
        <Step n={2} title="Company performance" intro="Trailing-twelve-month results at company level.">
          <KV
            rows={[
              ["Revenue", egp(N.revenue)],
              ["Normalized EBITDA", egp(N.normalizedEbitda), true],
              ["Normalized EBITDA margin", pct(N.normalizedMargin)],
              ...r.assumptions
                .filter((a) => a.relevant && /^dcf\.base\.growth_y\d$/.test(a.key))
                .map((a): [string, string] => [`Base case real revenue growth, year ${a.key.slice(-1)}`, pct(a.value)]),
            ]}
          />
        </Step>
      )}

      {showDcf && <Step n={3} title="Discounted cash flow" intro="Five years in nominal EGP, three scenarios, mid-year discounting. Terminal value by Gordon growth and by exit multiple.">
        {DR && (
          <>
            <h3>Discount rate</h3>
            {DR.warnings.map((w) => <p key={w} className="notice">{w}</p>)}
            <KV
              rows={[
                ...DR.components.map((c): [string, string] => [c.label, pct(c.value, 2)]),
                ["Cost of equity, USD", pct(DR.costOfEquityUsd, 2), true],
                ...DR.waccEgp.map((w, i): [string, string] => [`Nominal EGP rate, year ${i + 1}`, pct(w, 2)]),
                ["Nominal EGP rate, terminal", pct(DR.waccEgpTerminal, 2), true],
                ["Equivalent USD rate (cross-check)", pct(DR.waccUsd, 2)],
              ]}
            />
          </>
        )}
        {D.available && D.scenarios ? (
          <>
            <h3>Base scenario</h3>
            <div className="table-wrap" style={{ marginBottom: 14 }}>
              <table>
                <thead><tr><th /> {D.scenarios.base.years.map((y) => <th key={y.year} className="n">Year {y.year}</th>)}</tr></thead>
                <tbody>
                  {(
                    [
                      ["Revenue", "revenue"],
                      ["EBITDA", "ebitda"],
                      ["Tax", "tax"],
                      ["Capex", "capex"],
                      ["Free cash flow", "fcff"],
                      ["Discount factor", "discountFactor"],
                      ["Present value", "pv"],
                    ] as const
                  ).map(([l, k]) => (
                    <tr key={k}><td>{l}</td>{D.scenarios!.base.years.map((y) => <td key={y.year} className="n">{k === "discountFactor" ? y[k].toFixed(4) : egp(y[k])}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-wrap" style={{ marginBottom: 14 }}>
              <table>
                <thead><tr><th>Scenario</th><th className="n">Probability</th><th className="n">TV Gordon</th><th className="n">TV exit</th><th className="n">EV</th><th className="n">TV share</th></tr></thead>
                <tbody>
                  {(["downside", "base", "upside"] as const).map((s) => (
                    <tr key={s}><td style={{ textTransform: "capitalize" }}>{s}</td><td className="n">{pct(D.weights[s], 0)}</td><td className="n">{egp(D.scenarios![s].tvGordon)}</td><td className="n">{egp(D.scenarios![s].tvExit)}</td><td className="n">{egp(D.scenarios![s].ev)}</td><td className="n">{pct(D.scenarios![s].tvShareOfEv, 0)}</td></tr>
                  ))}
                  <tr className="total"><td>Probability-weighted</td><td /><td /><td /><td className="n">{egp(D.weightedEv)}</td><td /></tr>
                </tbody>
              </table>
            </div>
            {D.usdCrossCheck && (
              <p className="muted">
                USD cross-check ({D.usdCrossCheck.fxBasis === "ppp" ? "FX by relative purchasing-power parity" : "FX forecast"}): EV USD {egp(D.usdCrossCheck.evUsd)}, equal to {egpM(D.usdCrossCheck.evUsdInEgp)} at spot, {pct(D.usdCrossCheck.differencePct)} vs the EGP base case.
              </p>
            )}
          </>
        ) : (
          <p className="notice bad">DCF not computed. {D.reason}</p>
        )}
        <Assume id={id} all={r.assumptions} sections={["macro", "discount_rate", "forecast", "scenarios"]} sources={sources} />
      </Step>}

      <Step n={4} title="Market multiples" intro="Only sourced comparables enter the statistics. No multiple is ever assumed.">
        {M.available ? (
          <div className="table-wrap" style={{ marginBottom: 14 }}>
            <table>
              <thead><tr><th>Metric</th><th className="n">n</th><th className="n">Q1</th><th className="n">Median</th><th className="n">Q3</th><th className="n">Selected</th><th className="n">Base</th><th className="n">Weight</th><th className="n">Implied (mid)</th></tr></thead>
              <tbody>
                {M.stats.map((s) => (
                  <tr key={s.metric}><td>{s.metric.replace("_", " / ").toUpperCase()}</td><td className="n">{s.count}</td><td className="n">{mult(s.q1)}</td><td className="n">{mult(s.median)}</td><td className="n">{mult(s.q3)}</td><td className="n">{mult(s.selected)}</td><td className="n">{egp(s.base)}</td><td className="n">{pct(s.weight, 0)}</td><td className="n">{egp(s.mid)}</td></tr>
                ))}
                <tr className="total"><td>Weighted EV (low / mid / high)</td><td colSpan={8} className="n">{egp(M.low)} / {egp(M.mid)} / {egp(M.high)}</td></tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="notice bad">{M.reason} <Link href={`/admin/engagements/${id}/comparables`}>Add comparables</Link></p>
        )}
        <Assume id={id} all={r.assumptions} sections={["multiples"]} sources={sources} />
      </Step>

      {model === "asset_heavy" && (
        <Step n={5} title="Net asset value and income capitalisation" intro="Assets at market value from appraisals; normalized earnings capitalised at a sourced cap rate.">
          <div className="table-wrap" style={{ marginBottom: 14 }}>
            <table>
              <thead><tr><th>Asset</th><th>Type</th><th className="n">Market value</th><th className="n">Book value</th><th>Valued by</th></tr></thead>
              <tbody>
                {r.nav.rows.map((a) => (
                  <tr key={a.name}><td>{a.name}</td><td>{a.kind.replace("_", " ")}</td><td className="n">{a.marketValue === null ? <span className="tag bad">missing</span> : egp(a.marketValue)}</td><td className="n">{egp(a.bookValue)}</td><td className="muted">{a.sourceNote}</td></tr>
                ))}
                {!r.nav.rows.length && <tr><td colSpan={5} className="empty">No assets listed in the intake.</td></tr>}
                <tr className="total"><td>Total at market value</td><td /><td className="n">{egp(r.nav.totalMarketValue)}</td><td /><td /></tr>
              </tbody>
            </table>
          </div>
          <KV rows={[["Net operating income (normalized EBITDA)", egp(r.nav.incomeCap.noi)], ["Cap rate", pct(r.nav.incomeCap.capRate, 2)], ["Value: low / mid / high", `${egp(r.nav.incomeCap.low)} / ${egp(r.nav.incomeCap.mid)} / ${egp(r.nav.incomeCap.high)}`, true]]} />
          <Assume id={id} all={r.assumptions} sections={["nav"]} sources={sources} />
        </Step>
      )}
      {model === "early_stage" && (
        <Step n={5} title="Early-stage methods" intro="Results are equity values. Venture capital method, scorecard method and the latest priced round.">
          <h3>Venture capital method</h3>
          <KV
            rows={[
              ["Exit-year revenue", egp(r.earlyStage.vc.exitRevenue)],
              ["Years to exit", String(r.earlyStage.vc.exitYears)],
              ["Exit EV/Revenue (low / mid / high)", `${mult(r.earlyStage.vc.exitMultipleLow)} / ${mult(r.earlyStage.vc.exitMultiple)} / ${mult(r.earlyStage.vc.exitMultipleHigh)}`],
              ["Target return / retention after dilution", `${pct(r.earlyStage.vc.targetReturn)} / ${pct(r.earlyStage.vc.retention)}`],
              ["Equity value today: low / mid / high", `${egp(r.earlyStage.vc.low)} / ${egp(r.earlyStage.vc.mid)} / ${egp(r.earlyStage.vc.high)}`, true],
            ]}
          />
          <h3>Scorecard method</h3>
          <div className="table-wrap" style={{ marginBottom: 14 }}>
            <table>
              <thead><tr><th>Factor</th><th className="n">Weight</th><th className="n">Score</th><th className="n">Product</th></tr></thead>
              <tbody>
                {r.earlyStage.scorecard.factors.map((f) => <tr key={f.key}><td>{f.label}</td><td className="n">{pct(f.weight, 0)}</td><td className="n">{pct(f.score, 0)}</td><td className="n">{f.product.toFixed(3)}</td></tr>)}
                <tr className="total"><td>Base pre-money {egp(r.earlyStage.scorecard.base)} x multiplier {r.earlyStage.scorecard.multiplier.toFixed(3)}</td><td /><td /><td className="n">{egp(r.earlyStage.scorecard.value)}</td></tr>
              </tbody>
            </table>
          </div>
          <h3>Latest priced round</h3>
          <KV rows={[["Post-money", egp(r.earlyStage.round.postMoney)], ["Date", r.earlyStage.round.date ?? "–"], ["Change since the round", pct(r.earlyStage.round.adjustment)], ["Value", egp(r.earlyStage.round.value), true]]} />
          <Assume id={id} all={r.assumptions} sections={["early_stage"]} sources={sources} />
        </Step>
      )}
      {(model === "units" || model === "operating") && (
        <Step n={5} title="Method weights">
          <p>{R.weightsRationale}</p>
        </Step>
      )}

      <Step n={6} title="Asset-based floor" intro="Equipment, fit-out and inventory at resale value, less liquidation costs.">
        <KV rows={[...r.assetFloor.rows.map((a): [string, string] => [`${a.category.replace("_", "-")}: cost ${egp(a.cost)} at ${pct(a.resalePct, 0)}`, egp(a.value)]), [`Inventory ${egp(r.assetFloor.inventory)} at ${pct(r.assetFloor.inventoryRecoveryPct, 0)}`, egp(r.assetFloor.inventoryValue)], ["Less liquidation costs", egp(-r.assetFloor.liquidationCost)], ["Asset-based floor", egp(r.assetFloor.floor), true]]} />
        <Assume id={id} all={r.assumptions} sections={["asset_floor"]} sources={sources} />
      </Step>

      <Step n={7} title="Adjustments" intro="Applied to equity value. Check they do not repeat risks already priced in the company-specific premium.">
        <div className="table-wrap" style={{ marginBottom: 14 }}>
          <table>
            <thead><tr><th>Adjustment</th><th className="n">Applied</th><th className="n">Rule suggests</th><th>Basis</th></tr></thead>
            <tbody>
              {r.adjustments.rows.map((a) => <tr key={a.key}><td>{a.label}</td><td className="n">{pct(a.pct)}</td><td className="n">{pct(a.suggestedPct)}</td><td className="muted">{a.rationale}</td></tr>)}
              <tr className="total"><td>Combined discount</td><td className="n">{pct(r.adjustments.combinedDiscount)}</td><td /><td /></tr>
            </tbody>
          </table>
        </div>
        <Assume id={id} all={r.assumptions} sections={["adjustments"]} sources={sources} />
      </Step>

      <Step n={8} title="Reconciliation">
        {model !== "units" && model !== "operating" && <p>{R.weightsRationale}</p>}
        <div className="table-wrap" style={{ marginBottom: 14 }}>
          <table>
            <thead><tr><th>Method (enterprise-value basis)</th><th className="n">Low</th><th className="n">Mid</th><th className="n">High</th><th className="n">Weight</th></tr></thead>
            <tbody>
              {R.methods.map((m) => <tr key={m.method}><td>{m.label}{m.basis === "equity" && <span className="tag" style={{ marginLeft: 6 }}>equity value {egp(m.nativeMid)}</span>}{!m.available && <span className="tag bad" style={{ marginLeft: 6 }}>not available</span>}</td><td className="n">{egp(m.low)}</td><td className="n">{egp(m.mid)}</td><td className="n">{egp(m.high)}</td><td className="n">{pct(m.weight, 0)}</td></tr>)}
              <tr className="total"><td>Enterprise value{R.floorApplied ? " (floored at asset value)" : ""}</td><td className="n">{egp(R.evLow)}</td><td className="n">{egp(R.evMid)}</td><td className="n">{egp(R.evHigh)}</td><td /></tr>
              <tr><td>Net debt and deposits</td><td className="n" colSpan={3}>{egp(r.bridge.netAdjustment)}</td><td /></tr>
              <tr><td>Equity value</td><td className="n">{egp(R.equityLow)}</td><td className="n">{egp(R.equityMid)}</td><td className="n">{egp(R.equityHigh)}</td><td /></tr>
              <tr><td>After adjustments</td><td className="n">{egp(R.adjustedLow)}</td><td className="n">{egp(R.adjustedMid)}</td><td className="n">{egp(R.adjustedHigh)}</td><td /></tr>
              <tr className="total"><td>Concluded range (rounded to {egp(R.rounding)})</td><td className="n">{egp(R.roundedLow)}</td><td className="n">{egp(R.roundedMid)}</td><td className="n">{egp(R.roundedHigh)}</td><td /></tr>
              <tr><td>USD at spot</td><td className="n">{egp(R.usdLow)}</td><td className="n">{egp(R.usdMid)}</td><td className="n">{egp(R.usdHigh)}</td><td /></tr>
            </tbody>
          </table>
        </div>
        <div style={{ overflowX: "auto" }} dangerouslySetInnerHTML={{ __html: ff.svg }} />
        <Assume id={id} all={r.assumptions} sections={["reconciliation"]} sources={sources} />
      </Step>

      <Step n={9} title="Sensitivities" intro={model === "early_stage" ? "Venture capital method equity value." : "Base-scenario enterprise value."}>
        {r.sensitivities.length && r.sensitivities[0]!.values.length ? (
          <div className="stack">
            {r.sensitivities.map((g) => (
              <div key={g.key}>
                <h3>{g.title}</h3>
                <div style={{ overflowX: "auto" }} dangerouslySetInnerHTML={{ __html: heatmapSvg(g, palette, { width: 760 }).svg }} />
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Available once the DCF can be computed.</p>
        )}
      </Step>
    </div>
  );
}
