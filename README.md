# Valuation advisory platform

A reusable platform for advisory valuations of private companies in any industry: one engine, a new client file each time. Each engagement picks an **industry profile**, which sets the questionnaire, the forecast model, the valuation methods and their default weights. Market Egypt; model currency nominal EGP with a USD cross-check; your fee is recorded in USD. Currency, language and market are stored per engagement.

**What it produces for each client**

1. A private intake questionnaire (autosave, completion %, validation, P&L upload with extraction you confirm).
2. A valuation in nine visible steps: normalization, unit economics, DCF (three scenarios, two terminal values, explicit EGP inflation and FX), multiples, young-company weighting, asset floor, adjustments, reconciliation, sensitivities.
3. A formula-driven Excel model (13 sheets, blue inputs / black formulas) that reconciles to the engine to the cent.
4. A client report (Word and PDF) and an investor deck (PowerPoint, 9 slides).

## Industry profiles

| Family | Profiles | Forecast model | Methods (default weights) |
|---|---|---|---|
| Multi-site | F&B, retail chains, healthcare clinics, education | Unit by unit: same-store growth plus new openings | DCF, multiples, asset floor |
| Operating business | Manufacturing, distribution, professional services, logistics, construction | Company level: revenue growth per year and margin path | DCF, multiples, asset floor |
| Recurring revenue | SaaS | Company level, margin expansion | DCF, multiples (EV/revenue weighted) |
| Early stage | Startups | Venture-capital method, scorecard, latest priced round (equity values) | VC 40%, scorecard 30%, round 30% |
| Asset-heavy | Real estate, hotels | Net asset value at appraised market value, income capitalisation, DCF | NAV, cap rate, DCF |

Profiles live in `packages/engine/src/profiles.ts` (methods, defaults, labels) and `apps/web/lib/intake/config.ts` (questionnaire and industry KPIs). Edit a profile's default assumptions and weights in the app under **Industry profiles**; defaults still need confirming on each engagement. Banks, insurers and sum-of-the-parts group valuations are not supported.

## Stack

| Part | Where |
|---|---|
| Web app (Next.js 16, TypeScript) | `apps/web` |
| Valuation engine (pure, no I/O) + tests | `packages/engine` |
| Excel, Word, PDF, PowerPoint, charts | `packages/exports` |
| Database schema, migrations, seed (Drizzle, Neon Postgres) | `packages/db` |
| Methodology | `docs/METHODOLOGY.md` |
| Pre-send checklist | `docs/PRE-SEND-CHECKLIST.md` |

Hosting: Vercel project `valuation` (root `apps/web`, region fra1), Neon project `valuation` (Frankfurt), private Vercel Blob store `valuation-files` for uploads, logo and generated files.

## Environment variables

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `SESSION_SECRET` | 32+ random characters; signs the admin session |
| `BLOB_READ_WRITE_TOKEN` | Set automatically by the connected Blob store |
| `ANTHROPIC_API_KEY` | Live macro and comparable research, and P&L extraction. Without it you enter values and sources by hand. |

## Running locally

```bash
pnpm install
```

```bash
cp .env.example .env   # then fill in DATABASE_URL and SESSION_SECRET
```

```bash
pnpm db:migrate
```

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='choose-a-strong-one' pnpm db:seed
```

```bash
pnpm dev
```

Open http://localhost:3000/admin. The seed creates (or resets) the admin user and the fictional demo client. Use `pnpm db:seed -- --no-demo` to skip the demo.

## Tests

```bash
pnpm --filter @valuation/engine test
```

```bash
pnpm --filter @valuation/exports test
```

- `packages/engine/test/hand-example.test.ts`: the engine against a hand-calculated reference case (`packages/engine/fixtures/hand_calc.py` is an independent recalculation; year 1 is also checked by hand in the test), plus the quality rules (no invented multiples, staleness, missing sources, unconfirmed defaults, young-company weighting).
- `packages/exports/test/excel-reconcile.test.ts`: builds the workbook, recalculates it from scratch in LibreOffice, and checks every mapped cell (all scenario cash flows, all 75 sensitivity cells, the range) against the engine to EGP 0.01, plus zero formula errors. Needs LibreOffice (`soffice`) installed.
- `packages/exports/test/report-deck.test.ts`: renders Word, PDF and PowerPoint and checks content (disclaimer, open items, provisional stamp).

## How an engagement runs

1. **Engagements → New engagement.** Set the valuation date and fee.
2. **Overview → Create client link.** Send the link. The client fills the form at their own pace; you see completion and checks.
3. **Uploads.** Review figures extracted from P&Ls and confirm the ones to use.
4. **Assumptions.** Fetch macro data (each figure cites a URL the search returned; accept or reject), or enter values with a source. Confirm judgement defaults.
5. **Comparables.** Search or add comparables; each needs a dated source.
6. **Valuation.** Review the nine steps and edit assumptions in place; save a run.
7. **Open items.** Resolve or waive (with a reason) every blocking item; otherwise all outputs say PROVISIONAL.
8. **Exports.** Download Excel, Word, PDF and the deck from the same run. Work through the pre-send checklist.

Every change (client and admin) is in the **Audit trail**, with who, when, old and new values.

## Demo client

"Demo: Harbor Lane Coffee (fictional)" (F&B profile) has 24 months of invented data for three units. "Demo: Delta Corrugated Works (fictional)" (manufacturing profile) has invented company-level data; its macro inputs are copied from the sourced values on the first demo, and it has no comparables until sourced ones are added (`pnpm --filter @valuation/db exec tsx src/seed-demo-manufacturing.ts` recreates it). Its macro inputs and comparables are **illustrative placeholders, not market data**, attached to a source titled "ILLUSTRATIVE PLACEHOLDER". The demo therefore always shows as provisional.
