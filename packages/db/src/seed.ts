/**
 * Seed: admin user, branding, and a fictional demo client.
 *
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm db:seed
 *
 * The demo client's financials are invented for demonstration only. Its macro
 * inputs and comparables are ILLUSTRATIVE PLACEHOLDERS, flagged as such, so
 * every demo run stays provisional until real, sourced values replace them.
 */
import { config } from "dotenv";
config({ path: new URL("../../../.env", import.meta.url).pathname });
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { createDb } from "./index";
import * as s from "./schema";

const db = createDb();

const DISCLAIMER =
  "This is an advisory valuation prepared by an independent advisor for the addressee's internal decision-making. It is not a certified valuation by a licensed valuer, is not a fairness opinion, and must not be relied on as such for regulatory, tax, court or financing purposes. It relies on information supplied by management, which has not been audited or independently verified, and on market data from the sources cited, as at the dates shown.";

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("ADMIN_EMAIL / ADMIN_PASSWORD not set: admin user skipped.");
    return;
  }
  const hash = await bcrypt.hash(password, 12);
  await db
    .insert(s.adminUser)
    .values({ email, passwordHash: hash, name: "Admin" })
    .onConflictDoUpdate({ target: s.adminUser.email, set: { passwordHash: hash, passwordChangedAt: new Date() } });
  console.log(`admin user ready: ${email}`);
}

async function seedBranding() {
  await db.insert(s.branding).values({ id: 1, disclaimerText: DISCLAIMER }).onConflictDoNothing();
}

/** Deterministic pseudo-random so the demo is reproducible. */
function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

function months(endYm: string, n: number) {
  const [y, m] = endYm.split("-").map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}
const monthsBetween = (a: string, b: string) => {
  const [ya, ma] = a.split("-").map(Number) as [number, number];
  const [yb, mb] = b.split("-").map(Number) as [number, number];
  return (yb - ya) * 12 + (mb - ma);
};

async function seedDemo() {
  const existing = await db.select().from(s.client).where(eq(s.client.isDemo, true));
  for (const c of existing) await db.delete(s.client).where(eq(s.client.id, c.id));

  const [c] = await db
    .insert(s.client)
    .values({ name: "Demo: Harbor Lane Coffee (fictional)", legalName: "Harbor Lane Coffee LLC (fictional)", segment: "Specialty coffee", isDemo: true, notes: "Fictional demo data." })
    .returning();
  const valuationDate = "2026-10-31";
  const [e] = await db
    .insert(s.engagement)
    .values({ clientId: c!.id, title: "Advisory valuation (demo)", purpose: "Fundraising", scope: "100% of equity", valuationDate, feeAmount: "4500", status: "in_review" })
    .returning();
  const E = e!.id;

  const unitsDef = [
    { name: "Zamalek coffee bar", format: "cafe", city: "Cairo – Zamalek", opened: "2022-03-01", base: 1_150_000, mix: [0.55, 0.33, 0.07, 0.05], rent: 95_000, years: 4.5, renewal: true, sqm: 110, seats: 36 },
    { name: "New Cairo kiosk", format: "kiosk", city: "New Cairo", opened: "2023-06-01", base: 620_000, mix: [0.68, 0.32, 0, 0], rent: 48_000, years: 2.0, renewal: false, sqm: 28, seats: 0 },
    { name: "Sheikh Zayed café", format: "cafe", city: "Sheikh Zayed", opened: "2025-02-01", base: 980_000, mix: [0.58, 0.36, 0, 0.06], rent: 85_000, years: 7.0, renewal: true, sqm: 140, seats: 48 },
  ];
  const r = rng(42);
  const window = months("2026-10", 24);
  const unitIds: string[] = [];
  for (const [i, u] of unitsDef.entries()) {
    const [row] = await db
      .insert(s.unit)
      .values({ engagementId: E, name: u.name, format: u.format, city: u.city, openedOn: u.opened, status: "operating", sqm: String(u.sqm), seats: u.seats, sortOrder: i })
      .returning();
    unitIds.push(row!.id);
    await db.insert(s.lease).values({
      unitId: row!.id,
      yearsRemaining: String(u.years),
      monthlyRentEgp: String(Math.round(u.rent * 1.1)),
      escalationPct: "0.1",
      escalationEveryMonths: 12,
      renewalRight: u.renewal,
      renewalTerms: u.renewal ? "Option to renew 5 years at market rent" : null,
      depositEgp: String(u.rent * 3),
    });
    const capex =
      u.format === "kiosk"
        ? [
            ["fit_out", "Kiosk build and signage", 900_000, false],
            ["equipment", "Espresso machine and grinders", 1_100_000, true],
            ["other", "POS and small wares", 150_000, false],
          ]
        : [
            ["fit_out", "Fit-out and MEP works", 2_600_000, false],
            ["equipment", "Espresso machine, grinders, brewers", 1_700_000, true],
            ["furniture", "Furniture and lighting", 650_000, false],
            ["other", "POS, IT and small wares", 250_000, false],
          ];
    await db.insert(s.unitCapex).values(
      capex.map(([cat, desc, cost, imp]) => ({ unitId: row!.id, category: cat as string, description: desc as string, costEgp: String(cost), spentOn: u.opened, imported: imp as boolean })),
    );

    const rows: (typeof s.monthlyFinancial.$inferInsert)[] = [];
    const openYm = u.opened.slice(0, 7);
    for (const m of window) {
      if (m < openYm) continue;
      const age = monthsBetween(openYm, m) + 1;
      const ramp = Math.min(1, 0.45 + 0.05 * age);
      const infl = Math.pow(1.011, monthsBetween("2024-11", m));
      const season = 1 + 0.06 * Math.sin(((Number(m.slice(5)) - 3) / 12) * 2 * Math.PI);
      const total = Math.round(u.base * ramp * infl * season * (0.97 + 0.06 * r()));
      const ch = ["dine_in", "delivery", "wholesale", "online"] as const;
      ch.forEach((k, j) => {
        if (u.mix[j]! > 0) rows.push({ engagementId: E, unitId: row!.id, period: `${m}-01`, lineItem: "revenue", channel: k, amountEgp: String(Math.round(total * u.mix[j]!)) });
      });
      const delivery = total * u.mix[1]!;
      const rentNow = u.rent * (m >= "2026-03" ? 1.1 : 1);
      const cost = (line: (typeof s.lineItem.enumValues)[number], v: number) =>
        rows.push({ engagementId: E, unitId: row!.id, period: `${m}-01`, lineItem: line, channel: null, amountEgp: String(Math.round(v)) });
      cost("cogs", total * (0.3 + 0.02 * r()));
      cost("labour", Math.max(total * 0.17, 110_000 * infl));
      cost("rent", rentNow);
      cost("delivery_commission", delivery * 0.22);
      cost("marketing", total * 0.025);
      cost("utilities", total * 0.04);
      cost("maintenance", total * 0.012);
      cost("other_opex", total * 0.03);
    }
    for (let k = 0; k < rows.length; k += 200) await db.insert(s.monthlyFinancial).values(rows.slice(k, k + 200));
  }
  // Head office
  await db.insert(s.monthlyFinancial).values(
    window.map((m) => ({ engagementId: E, unitId: null, period: `${m}-01`, lineItem: "head_office" as const, channel: null, amountEgp: String(Math.round(210_000 * Math.pow(1.011, monthsBetween("2024-11", m)))) })),
  );

  await db.insert(s.addback).values([
    { engagementId: E, kind: "owner_pay", description: "Founder salary (runs operations)", amountEgp: "960000", recurring: true, evidenceNote: "Payroll records (demo)" },
    { engagementId: E, kind: "one_off", description: "Rebranding agency fees", amountEgp: "280000", recurring: false, evidenceNote: "Invoice (demo)" },
    { engagementId: E, kind: "related_party", description: "Car lease for founder's family member above market", amountEgp: "90000", recurring: true, evidenceNote: null },
  ]);
  await db.insert(s.debtItem).values([
    { engagementId: E, kind: "bank_loan", counterparty: "Bank loan (demo)", balance: "2400000", currency: "EGP", ratePct: "0.27", maturity: "2028-06-30" },
    { engagementId: E, kind: "shareholder_loan", counterparty: "Founder loan", balance: "30000", currency: "USD", ratePct: "0", maturity: null },
    { engagementId: E, kind: "cash", counterparty: "Bank balances", balance: "1850000", currency: "EGP", ratePct: null, maturity: null },
    { engagementId: E, kind: "deposit_paid", counterparty: "Rent deposits", balance: "684000", currency: "EGP", ratePct: null, maturity: null },
  ]);

  const sections: Record<string, Record<string, unknown>> = {
    purpose: { purpose: "fundraising", stake: 1, valuation_date: valuationDate, notes: "Raising growth capital for three new units (demo)." },
    business: {
      brand_name: "Harbor Lane Coffee (demo)",
      legal_name: "Harbor Lane Coffee LLC (fictional)",
      legal_form: "llc",
      founded: 2022,
      concept: "Specialty coffee bars and kiosks with delivery, light wholesale and online beans",
      description: "Fictional specialty coffee operator used to demonstrate the platform. Three units in Greater Cairo.",
      employees: 46,
      shareholders: "Founder 80%, angel investor 20% (fictional)",
      website: "",
    },
    financials: { vat_inclusive: "no", delivery_reporting: "gross", end_month: "2026-10", months_count: 24 },
    costs: { imported_cogs_share: 0.45, bean_sourcing: "Green beans imported via a Cairo importer, roasted by a third party (demo).", staff_count: 46, head_office_desc: "Founder office, accounting, marketing manager (demo)." },
    owner: {},
    debt: {},
    operations: { daily_orders: 1450, average_ticket: 165, repeat_rate: 0.42, delivery_apps: "Talabat, Breadfast (demo)", delivery_dependency: 3, owner_dependency: 4, inventory_value: 620000, key_staff: "Head barista, operations lead (demo)" },
    brand: { trademark: "yes", trademark_detail: "Demo registration", social_followers: 38000, recipes_ip: "House espresso blend and cold brew recipe (demo)", wholesale_contracts: "Two office coffee contracts (demo)" },
    growth: { units_y1: 1, units_y2: 1, units_y3: 1, units_y4: 0, units_y5: 0, budget: 16000000, funding: "Equity raise (demo)", plan: "Open one café a year for three years in West and East Cairo (demo)." },
    offers: { has_offers: "no", has_past_valuations: "no" },
  };
  for (const [k, v] of Object.entries(sections))
    await db.insert(s.intakeSection).values({ engagementId: E, sectionKey: k, data: v, completionPct: 100, updatedBy: "seed" });

  // Illustrative placeholders (NOT market data) so the demo calculates end to end.
  // Exchange rates are never seeded: the USD/EGP rate must be looked up live
  // ("Fetch macro data" or entered with a dated source) on the day of use.
  const [ph] = await db
    .insert(s.source)
    .values({
      engagementId: E,
      kind: "method",
      title: "ILLUSTRATIVE PLACEHOLDER: not market data (demo only)",
      publisher: "Seed script",
      publishedDate: valuationDate,
      excerpt: "Round numbers used only so the demo can run. Replace with live, cited data before relying on any output.",
      retrievedBy: "admin",
      accepted: false,
    })
    .returning();
  const placeholders: [string, number, string][] = [
    ["macro.us_rf", 0.045, "pct"],
    ["macro.erp", 0.045, "pct"],
    ["macro.crp_egypt", 0.07, "pct"],
    ["macro.egp_tbill", 0.25, "pct"],
    ["macro.egp_inflation_y1", 0.14, "pct"],
    ["macro.egp_inflation_y2", 0.11, "pct"],
    ["macro.egp_inflation_y3", 0.09, "pct"],
    ["macro.egp_inflation_y4", 0.08, "pct"],
    ["macro.egp_inflation_y5", 0.07, "pct"],
    ["macro.egp_inflation_lt", 0.07, "pct"],
    ["macro.usd_inflation", 0.02, "pct"],
    ["macro.tax_rate", 0.225, "pct"],
    ["macro.vat_rate", 0.14, "pct"],
    ["dr.size_premium", 0.03, "pct"],
    ["norm.market_manager_salary", 720000, "egp"],
  ];
  for (const [key, value, unit] of placeholders)
    await db.insert(s.assumption).values({
      engagementId: E,
      key,
      label: key,
      value: String(value),
      unit,
      category: key.startsWith("macro") ? "macro" : "market",
      sourceId: ph!.id,
      asOfDate: valuationDate,
      isPlaceholder: true,
      confirmed: false,
      rationale: "Illustrative placeholder for the demo. Not market data.",
      updatedBy: "seed",
    });
  const comps: [string, number, number, number][] = [
    ["Placeholder comparable A (fictional)", 5.5, 0.9, 2.6],
    ["Placeholder comparable B (fictional)", 6.5, 1.1, 3.0],
    ["Placeholder comparable C (fictional)", 7.0, 1.3, 3.4],
    ["Placeholder comparable D (fictional)", 8.0, 1.6, 3.8],
    ["Placeholder comparable E (fictional)", 9.5, 2.0, 4.2],
  ];
  await db.insert(s.comparable).values(
    comps.map(([name, ev, rv, sde]) => ({
      engagementId: E,
      kind: "transaction" as const,
      name,
      country: "n/a",
      dealDate: valuationDate,
      description: "Fictional placeholder for the demo. Replace with sourced comparables.",
      evToEbitda: String(ev),
      evToRevenue: String(rv),
      priceToSde: String(sde),
      sourceId: ph!.id,
    })),
  );
  await db.insert(s.auditLog).values({ engagementId: E, actor: "seed", action: "create", entity: "engagement", entityId: E, newValue: { demo: true } });
  console.log(`demo client ready: engagement ${E}`);
}

await seedAdmin();
await seedBranding();
if (!process.argv.includes("--no-demo")) await seedDemo();
process.exit(0);
