# Methodology

All amounts are nominal EGP unless stated. Percentages are decimals in the engine. Every formula below is implemented once in `packages/engine/src` and written cell-for-cell into the Excel model (`packages/exports/src/excel/workbook.ts`); a test recalculates the workbook in LibreOffice and compares it with the engine to the cent.

## Basis of value (in the report)
The report's Methodology section defines the standard of value (fair market value, investment value or IFRS 13 fair value), the premise (going concern, orderly or forced liquidation) and the basis (control or minority) set on the engagement, and explains how they affect the number: the asset floor's role, control-style normalization, the marketability and company-specific discounts actually applied, that the range is for 100% of the equity, and that USD figures are translations. On a minority basis it states that no separate discount for lack of control is applied by the model.

## 1. Normalization (trailing twelve months)
- Revenue = sum of unit revenue by channel. Reported EBITDA = revenue − unit costs − head-office costs.
- SDE = reported EBITDA + add-backs (owner pay, one-offs, related-party excess, non-operating).
- Normalized EBITDA = SDE − market-rate manager cost (sourced assumption).
- VAT-inclusive sales are divided by (1 + VAT rate).

## 2. Unit economics
Per unit: prime cost % = (COGS + labour) / sales; rent %; four-wall EBITDA = sales − all unit costs; payback = investment / annualised four-wall EBITDA. Mature = open ≥ 24 months with 12 months of TTM data. New-unit template (derived, overridable): mature sales = average annualised sales of mature units; capex = average recorded capex per unit; year-1 ramp = observed (average of months 1–12 ÷ last 3 months, for units with a contiguous series of 15+ months) or the default.

## 3. DCF
- **Discount rate (default, USD build-up):** Ke(USD) = US 10y + ERP + Egypt CRP + size premium + company-specific premium. Ke(EGP, year t) = (1 + Ke USD)(1 + EGP inflation t)/(1 + US inflation) − 1. Terminal uses long-term EGP inflation. WACC = (1 − wd)·Ke + wd·Kd·(1 − tax).
- **Alternative (EGP T-bill):** EGP T-bill + ERP + CRP + size + CSRP, with a warning that the T-bill already prices sovereign risk.
- **Forecast (each scenario):** price index compounds EGP inflation; existing revenue grows at (1 + real SSS)(1 + inflation); new units open at the start of the year and earn mature sales × price index × (ramp Y1, ramp Y2, then 100%). EBITDA margin moves linearly from the normalized margin to margin + Δ by year 5. Tax = max(0, EBITDA − D&A) × tax rate. Capex = new units × capex per unit × price index + maintenance % of revenue. ΔNWC = NWC % × change in revenue. FCFF = EBITDA − tax − capex − ΔNWC.
- **Discounting:** mid-year, with year-specific rates (cumulative factor).
- **Terminal value:** Gordon growth on FCFF without expansion capex, g = (1 + real g)(1 + long-term inflation) − 1; and exit multiple × year-5 EBITDA. Blended by an explicit weight.
- **Scenarios:** base / upside / downside, probability-weighted.
- **USD cross-check:** FCFF translated at a USD/EGP forecast (if all five years are given) or relative PPP, discounted at the USD-equivalent rate, translated back at spot.

## 4. Multiples
Only sourced, included comparables. Q1 / median / Q3 by `QUARTILE.INC`. Implied EV = metric × multiple for EV/EBITDA (normalized EBITDA), EV/revenue and price/SDE; weighted. With no sourced comparables the method is unavailable and the run is provisional. Multiples are never assumed.

## 5. Young company
Under 36 months of operating history, default weights are DCF 70% / multiples 30% (otherwise 50 / 50). Weights are editable and explained in the report.

## 6. Asset floor
Cost × resale % by category (equipment, fit-out, furniture, other) + inventory × recovery %, less liquidation costs. The reconciled EV cannot fall below it.

## 7. Adjustments
Applied multiplicatively to equity value: marketability (DLOM), key-person (owner dependency score), lease risk (sales-weighted years left), delivery-app reliance (delivery share), FX exposure (imported COGS share). Rules suggest a value; the applied value is an assumption you confirm.

## 8. Reconciliation
Weighted low / mid / high EV, floored at the asset value → + equity bridge (cash and refundable deposits, less loans, overdrafts and deposits held; IFRS 16 lease liabilities excluded because rent is in EBITDA; USD balances at spot) → × adjustments → rounded range. USD equivalent at spot.

## 9. Sensitivities
Base-scenario EV recomputed in full for: discount rate ±2pp vs terminal real growth ±1pp; EBITDA margin ±2pp vs real SSS ±4pp; new units per year ±2 vs capex per unit ±20%.

## Industry profiles and additional methods
- **Operating businesses:** existing revenue grows at a real rate per year (`dcf.<scenario>.growth_y1..5`), derived from the client's planned nominal growth deflated by EGP inflation (upside +2pp, downside −4pp), and confirmed by the advisor. No unit openings.
- **Net asset value (asset-heavy):** sum of appraised market values of the listed assets (enterprise-value basis). Assets without a market value are open items.
- **Income capitalisation:** normalized EBITDA ÷ cap rate (sourced); low/high at cap rate ± spread.
- **Venture capital method:** exit-year revenue × exit EV/revenue (comparables median; Q1/Q3 for low/high) × retention after dilution ÷ (1 + target return)^years. Equity value.
- **Scorecard method:** median pre-money of comparable funded startups (sourced) × Σ(weight × score). Equity value.
- **Funding round:** latest priced post-money × (1 + change since the round). Equity value.
- **Reconciliation with equity methods:** equity results are converted to an enterprise-value equivalent (equity − net-debt bridge), weighted with the other methods, floored at the asset value, then the bridge is added back, so equity methods are not distorted by the bridge.
- **Customer concentration:** discount suggested from the largest customer's share of revenue (>15% 2.5%, >30% 5%, >50% 7.5%).
- **Young-company rule:** for profiles that use it, under 36 months of history 40% of the multiples weight moves to the DCF.
- Assumptions that do not apply to a profile are hidden and never raise open items.

## Quality rules built in
- Market data (macro, size premium, salary, comparables) needs a cited, dated source; data older than 30 days is flagged.
- Judgement defaults stay open items until confirmed. Missing inputs are listed under Open Items and every output is stamped PROVISIONAL until they are resolved or waived with a reason.
- Live research only proposes figures whose URL appeared in the search results; you accept each one.
