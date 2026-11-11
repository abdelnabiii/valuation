/**
 * Adds a second, fictional demo client on the manufacturing profile.
 *   pnpm --filter @valuation/db exec tsx src/seed-demo-manufacturing.ts
 *
 * Financials are invented for demonstration. Macro inputs are copied from the
 * sourced assumptions on the F&B demo (same sources and dates); anything that
 * was a placeholder there stays flagged as a placeholder. No comparables are
 * seeded: the multiples method stays an open item until sourced ones are added.
 */
import { config } from "dotenv";
config({ path: new URL("../../../.env", import.meta.url).pathname });
import { and, eq, like } from "drizzle-orm";
import { createDb } from "./index";
import * as s from "./schema";

const db = createDb();
const NAME = "Demo: Delta Corrugated Works (fictional)";

const months = (endYm: string, n: number) => {
  const [y, m] = endYm.split("-").map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
};

async function main() {
  for (const c of await db.select().from(s.client).where(eq(s.client.name, NAME))) await db.delete(s.client).where(eq(s.client.id, c.id));
  const [c] = await db.insert(s.client).values({ name: NAME, legalName: "Delta Corrugated Works SAE (fictional)", segment: "Packaging manufacturing", isDemo: true, notes: "Fictional demo data." }).returning();
  const valuationDate = "2026-10-31";
  const [e] = await db
    .insert(s.engagement)
    .values({ clientId: c!.id, title: "Advisory valuation (demo)", profileKey: "manufacturing", purpose: "Partner buy-out", scope: "100% of equity", valuationDate, feeAmount: "6000", status: "in_review" })
    .returning();
  const E = e!.id;
  const [u] = await db.insert(s.unit).values({ engagementId: E, name: "Company", format: "company", status: "operating", sortOrder: 0 }).returning();
  const U = u!.id;
  await db.insert(s.lease).values({ unitId: U, yearsRemaining: "6", monthlyRentEgp: "180000", escalationPct: "0.1", escalationEveryMonths: 12, renewalRight: true, renewalTerms: "Renewable for 5 years", depositEgp: "540000" });
  await db.insert(s.unitCapex).values([
    { unitId: U, category: "equipment", description: "Corrugator line and converting machines", costEgp: "28000000", spentOn: "2019-05-01", imported: true },
    { unitId: U, category: "fit_out", description: "Factory fit-out and utilities", costEgp: "6000000", spentOn: "2019-03-01", imported: false },
    { unitId: U, category: "other", description: "Forklifts and delivery trucks", costEgp: "3000000", spentOn: "2021-01-01", imported: false },
  ]);
  const rows: (typeof s.monthlyFinancial.$inferInsert)[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const [i, m] of months("2026-10", 24).entries()) {
    const total = Math.round(5_400_000 * Math.pow(1.012, i) * (0.96 + 0.08 * rnd()));
    const put = (line: (typeof s.lineItem.enumValues)[number], v: number, ch: "dine_in" | "delivery" | "wholesale" | null = null) =>
      rows.push({ engagementId: E, unitId: U, period: `${m}-01`, lineItem: line, channel: ch, amountEgp: String(Math.round(v)) });
    put("revenue", total * 0.6, "dine_in");
    put("revenue", total * 0.22, "delivery");
    put("revenue", total * 0.18, "wholesale");
    put("cogs", total * (0.6 + 0.03 * rnd()));
    put("labour", total * 0.09);
    put("rent", 180_000);
    put("delivery_commission", total * 0.22 * 0.03);
    put("marketing", total * 0.01);
    put("utilities", total * 0.045);
    put("maintenance", total * 0.02);
    put("other_opex", total * 0.03);
  }
  for (let k = 0; k < rows.length; k += 200) await db.insert(s.monthlyFinancial).values(rows.slice(k, k + 200));
  await db.insert(s.addback).values([
    { engagementId: E, kind: "owner_pay", description: "Managing partner salary", amountEgp: "1800000", recurring: true, evidenceNote: "Payroll (demo)" },
    { engagementId: E, kind: "one_off", description: "Legal costs of a settled customer dispute", amountEgp: "650000", recurring: false, evidenceNote: "Invoices (demo)" },
  ]);
  await db.insert(s.debtItem).values([
    { engagementId: E, kind: "bank_loan", counterparty: "Equipment loan (demo)", balance: "15000000", currency: "EGP", ratePct: "0.28", maturity: "2029-12-31" },
    { engagementId: E, kind: "cash", counterparty: "Bank balances", balance: "4200000", currency: "EGP", ratePct: null, maturity: null },
  ]);
  const sections: Record<string, Record<string, unknown>> = {
    purpose: { purpose: "partner_buyout", stake: 1, valuation_date: valuationDate, notes: "One partner is selling a 40% stake to the other (demo)." },
    business: { brand_name: "Delta Corrugated (demo)", legal_name: "Delta Corrugated Works SAE (fictional)", legal_form: "jsc", founded: 2019, concept: "Corrugated boxes and packaging for FMCG and agricultural exporters", description: "Fictional packaging manufacturer used to demonstrate the manufacturing profile.", employees: 140, shareholders: "Two partners, 60% / 40% (fictional)" },
    financials: { vat_inclusive: "no", end_month: "2026-10", months_count: 24 },
    costs: { imported_cogs_share: 0.55, bean_sourcing: "Kraft paper imported from Europe and Turkey (demo).", staff_count: 140 },
    owner: {},
    debt: {},
    operations: { capacity_utilisation: 0.72, export_share: 0.18, order_backlog: 9500000, main_inputs: "Kraft paper, starch, inks (demo)", owner_dependency: 3, top_customer_share: 0.28, inventory_value: 9000000, key_staff: "Plant manager, sales director (demo)" },
    brand: { trademark: "yes", trademark_detail: "Demo registration", wholesale_contracts: "Annual supply contracts with three FMCG groups (demo)" },
    growth: { growth_y1: 0.18, growth_y2: 0.15, growth_y3: 0.12, growth_y4: 0.1, growth_y5: 0.09, budget: 12000000, funding: "Retained earnings and bank debt (demo)", plan: "Second converting line in year 2 (demo)." },
    offers: { has_offers: "no", has_past_valuations: "no" },
  };
  for (const [k, v] of Object.entries(sections)) await db.insert(s.intakeSection).values({ engagementId: E, sectionKey: k, data: v, completionPct: 100, updatedBy: "seed" });

  // Copy sourced macro assumptions (and their sources) from the F&B demo.
  const [fnbClient] = await db.select().from(s.client).where(like(s.client.name, "Demo: Harbor Lane%"));
  if (fnbClient) {
    const [fe] = await db.select().from(s.engagement).where(eq(s.engagement.clientId, fnbClient.id));
    if (fe) {
      const src = await db.select().from(s.assumption).where(and(eq(s.assumption.engagementId, fe.id)));
      const srcMap = new Map<string, string>();
      for (const a of src.filter((x) => x.key.startsWith("macro.") || x.key.startsWith("dr.") || x.key.startsWith("norm."))) {
        let sid: string | null = null;
        if (a.sourceId) {
          if (!srcMap.has(a.sourceId)) {
            const [so] = await db.select().from(s.source).where(eq(s.source.id, a.sourceId));
            if (so) {
              const { id: _id, engagementId: _e, ...rest } = so;
              const [copy] = await db.insert(s.source).values({ ...rest, engagementId: E }).returning();
              srcMap.set(a.sourceId, copy!.id);
            }
          }
          sid = srcMap.get(a.sourceId) ?? null;
        }
        const { id: _i, engagementId: _x, sourceId: _s, ...rest } = a;
        await db.insert(s.assumption).values({ ...rest, engagementId: E, sourceId: sid, updatedBy: "seed (copied from F&B demo)" });
      }
    }
  }
  await db.insert(s.auditLog).values({ engagementId: E, actor: "seed", action: "create", entity: "engagement", entityId: E, newValue: { demo: true, profile: "manufacturing" } });
  console.log(`manufacturing demo ready: engagement ${E}`);
  process.exit(0);
}
await main();
