# Project rules for Claude

## Exchange rates and market data
- Never state, assume or reuse a remembered exchange rate (USD/EGP or any other currency). Every time a currency rate is asked about or needed, look up today's rate live on the web first and quote it with its source and timestamp.
- Never hard-code exchange rates or other market data (T-bill yields, inflation, tax, VAT, risk premia) in code, seeds or fixtures used by real engagements. They are assumptions with a cited, dated source.
- Test fixtures (`packages/engine/fixtures`) use round fictional numbers on purpose; they are not market data and must never be shown to a client.

## Valuation quality rules
- Never invent client data or market data. Missing inputs become Open Items and the valuation stays provisional.
- Every number in a report traces to an input or a cited source.
- The engine (`packages/engine`) stays pure. Any formula change must be mirrored in the Excel writer (`packages/exports/src/excel/workbook.ts`), and `pnpm --filter @valuation/exports test` must still reconcile to the cent.
