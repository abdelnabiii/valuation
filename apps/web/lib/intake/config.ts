/**
 * Per-profile intake configuration: which sections a client sees, the
 * industry-specific questions, and the labels for channels and units.
 * Client-safe (no server imports). Built from the shared F&B definition in
 * sections.ts so every profile keeps the same core.
 */
import { getProfile, type ForecastModel } from "@valuation/engine";
import { COST_LINES, SECTIONS, type Field, type SectionDef } from "./sections";

export interface IntakeConfig {
  profileKey: string;
  profileLabel: string;
  model: ForecastModel;
  unitSingular: string;
  unitPlural: string;
  channels: { key: "dine_in" | "delivery" | "wholesale" | "online"; label: string }[];
  costLines: { key: string; label: string }[];
  sections: SectionDef[];
}

const num = (key: string, label: string, required = false, help?: string): Field => ({ key, label, type: "number", required, min: 0, help });
const money = (key: string, label: string, required = false, help?: string): Field => ({ key, label, type: "money", required, help });
const pct = (key: string, label: string, required = false, help?: string): Field => ({ key, label, type: "pct", required, help });
const text = (key: string, label: string, required = false): Field => ({ key, label, type: "textarea", required });

/** Industry KPIs per profile, shown in the Operations section. */
export const PROFILE_KPIS: Record<string, Field[]> = {
  fnb: [
    num("daily_orders", "Average daily orders (all units)", true),
    money("average_ticket", "Average ticket (EGP, excl. VAT)", true),
    pct("repeat_rate", "Share of orders from repeat customers", true),
    { key: "delivery_apps", label: "Delivery apps used", type: "text", required: true },
    { key: "delivery_dependency", label: "How dependent are you on delivery apps?", type: "score", required: true, help: "1 = not at all, 5 = could not operate without them." },
  ],
  retail: [
    num("transactions_per_day", "Average transactions per day (all stores)", true),
    money("average_basket", "Average basket (EGP, excl. VAT)", true),
    money("sales_per_sqm", "Annual sales per m² (EGP)"),
    num("inventory_turns", "Inventory turns per year"),
  ],
  clinics: [
    num("patients_per_day", "Average patient visits per day (all branches)", true),
    money("revenue_per_visit", "Average revenue per visit (EGP)", true),
    num("doctors", "Number of doctors / practitioners", true),
    pct("insurance_share", "Share of revenue paid by insurers", true),
  ],
  schools: [
    num("students", "Enrolled students", true),
    num("capacity", "Total student capacity", true),
    money("average_fee", "Average annual fee per student (EGP)", true),
    pct("retention_rate", "Student re-enrolment rate", true),
  ],
  manufacturing: [
    pct("capacity_utilisation", "Average capacity utilisation", true),
    pct("export_share", "Share of revenue from exports", true),
    money("order_backlog", "Confirmed order backlog (EGP)"),
    text("main_inputs", "Main raw materials and where they come from", true),
  ],
  distribution: [
    num("receivable_days", "Average days to collect from customers", true),
    num("inventory_days", "Average days of inventory", true),
    num("payable_days", "Average days to pay suppliers", true),
    pct("top_supplier_share", "Share of purchases from the largest supplier", true),
    num("customers", "Number of active customers"),
  ],
  services: [
    num("billable_staff", "Billable staff", true),
    pct("utilisation", "Average billable utilisation", true),
    pct("recurring_share", "Share of revenue under retainers or multi-year contracts", true),
    money("average_contract", "Average contract or project size (EGP)"),
  ],
  logistics: [
    num("fleet_size", "Fleet size (vehicles)", true),
    pct("fleet_owned_share", "Share of the fleet that is owned", true),
    pct("fleet_utilisation", "Average fleet utilisation", true),
    num("average_vehicle_age", "Average vehicle age (years)"),
  ],
  construction: [
    money("backlog_value", "Contract backlog (EGP)", true),
    pct("government_share", "Share of revenue from government projects", true),
    money("retentions_receivable", "Retentions and receivables outstanding (EGP)", true),
    num("projects_running", "Projects currently running"),
  ],
  saas: [
    money("arr", "Annual recurring revenue (ARR, EGP)", true),
    pct("monthly_churn", "Monthly customer churn", true),
    pct("net_revenue_retention", "Net revenue retention (12 months)", true),
    num("customers", "Paying customers", true),
    money("cac", "Customer acquisition cost (EGP)"),
    pct("gross_margin_kpi", "Gross margin"),
  ],
  startup: [
    money("monthly_burn", "Monthly net cash burn (EGP)", true),
    num("runway_months", "Months of runway at current burn", true),
    num("users", "Active users or customers", true),
    pct("growth_mom", "Monthly growth rate (last 6 months)"),
    text("team", "Founders and key team (experience)", true),
    text("traction", "Traction to date (pilots, contracts, revenue milestones)", true),
  ],
  real_estate: [
    pct("occupancy", "Occupancy (by lettable area)", true),
    num("lettable_area", "Total lettable area (m²)", true),
    money("average_rent_sqm", "Average rent per m² per year (EGP)", true),
    num("wault_years", "Weighted average unexpired lease term (years)", true),
  ],
  hospitality: [
    num("keys", "Number of rooms (keys)", true),
    pct("occupancy", "Average occupancy", true),
    money("adr", "Average daily rate (EGP)", true),
    pct("gop_margin", "Gross operating profit margin"),
  ],
};

const GENERIC_OPS: Field[] = [
  { key: "owner_dependency", label: "How dependent is the business on the owner day-to-day?", type: "score", required: true, help: "1 = runs without the owner, 5 = cannot run without the owner." },
  pct("top_customer_share", "Share of revenue from the largest customer", true, "Use 0% for consumer businesses with no large customers."),
  money("inventory_value", "Inventory at cost today (EGP)", true, "Use 0 if you hold no inventory."),
  text("key_staff", "Key staff and roles"),
];

function clone(key: string): SectionDef {
  const s = SECTIONS.find((x) => x.key === key)!;
  return { ...s, fields: s.fields?.map((f) => ({ ...f })) };
}

export function intakeConfig(profileKey: string | null | undefined): IntakeConfig {
  const p = getProfile(profileKey);
  const model = p.model;
  const channels = (["dine_in", "delivery", "wholesale", "online"] as const).map((k) => ({ key: k, label: p.channelLabels[k] }));
  const costLines = COST_LINES.map((c) => ({
    key: c.key,
    label: c.key === "delivery_commission" ? `Commissions to ${p.channelLabels.delivery.toLowerCase()}` : c.key === "cogs" ? (model === "units" && p.key === "fnb" ? "Cost of goods sold" : "Cost of sales (materials, goods, direct costs)") : c.label,
  }));
  const U = p.unitNoun.plural.charAt(0).toUpperCase() + p.unitNoun.plural.slice(1);

  const sections: SectionDef[] = [];
  sections.push(clone("purpose"));
  const business = clone("business");
  business.fields = business.fields!.map((f) => (f.key === "concept" ? { ...f, label: "What the business does (products or services)" } : f));
  sections.push(business);
  if (model === "units") sections.push({ ...clone("units"), title: `${U} and locations`, intro: `One line per ${p.unitNoun.singular}.` });

  const fin = clone("financials");
  fin.title = model === "units" ? "Monthly financials" : "Monthly financials (company level)";
  fin.intro =
    model === "units"
      ? `Up to 24 months by ${p.unitNoun.singular}. Revenue by channel and costs by line, in EGP excluding VAT. Central costs go in the Head office tab.`
      : model === "early_stage"
        ? "Monthly revenue and costs since you started, in EGP excluding VAT. Enter what you have; zero revenue months are fine."
        : "Up to 24 months for the company. Revenue by stream and costs by line, in EGP excluding VAT.";
  if (!["fnb", "retail"].includes(p.key)) fin.fields = fin.fields!.filter((f) => f.key !== "delivery_reporting");
  sections.push(fin);

  const costs = clone("costs");
  costs.fields = costs.fields!.map((f) =>
    f.key === "imported_cogs_share"
      ? { ...f, label: "Share of cost of sales that is imported or priced in USD" }
      : f.key === "bean_sourcing"
        ? { ...f, label: "Main suppliers and inputs" }
        : f.key === "price_increases"
          ? { ...f, label: "Price increases in the last 24 months (dates and %)" }
          : f,
  );
  if (model !== "units") costs.fields = costs.fields.filter((f) => f.key !== "head_office_desc");
  sections.push(costs);
  sections.push(clone("owner"));
  sections.push(clone("debt"));

  if (model === "units" || model === "operating")
    sections.push(model === "units" ? clone("leases") : { ...clone("leases"), title: "Premises and leases", intro: "Your main premises (office, plant, warehouse)." });
  if (model !== "early_stage")
    sections.push(model === "units" ? clone("capex") : { ...clone("capex"), title: "Fixed assets", intro: "Equipment, vehicles, fit-out and other fixed assets you own." });
  if (model === "asset_heavy")
    sections.push({ key: "assets", title: "Properties and major assets", intro: "Each property or major asset with its market value from a recent appraisal.", kind: "assets" as SectionDef["kind"] });
  if (model === "early_stage")
    sections.push({
      key: "funding",
      title: "Funding history",
      intro: "Your equity funding to date. The latest priced round is used as one valuation reference.",
      kind: "fields",
      fields: [
        { key: "last_round_date", label: "Date of the latest priced round", type: "date" },
        money("last_round_post_money", "Post-money valuation of that round (EGP)"),
        money("last_round_amount", "Amount raised in that round (EGP)"),
        money("total_raised", "Total equity raised to date (EGP)", true),
        { key: "investors", label: "Main investors", type: "text" },
        text("rounds_history", "Earlier rounds (date, amount, valuation)"),
      ],
    });

  sections.push({
    key: "operations",
    title: model === "units" ? "Operations" : "Operations and key indicators",
    intro: "Key indicators for the last 3 months.",
    kind: "fields",
    fields: [...(PROFILE_KPIS[p.key] ?? []), ...GENERIC_OPS],
  });
  sections.push({ ...clone("brand"), title: "Brand, IP and contracts" });

  const growth: SectionDef = clone("growth");
  if (model === "units") growth.fields = growth.fields!.map((f) => (f.key.startsWith("units_y") ? { ...f, label: f.label.replace("units", p.unitNoun.plural) } : f));
  else if (model === "early_stage")
    growth.fields = [
      money("exit_revenue", "Revenue you plan to reach in the exit year (EGP)", true),
      num("exit_years", "Years until that exit year", true),
      money("budget", "Funding you plan to raise (EGP)", true),
      text("funding", "Use of funds", true),
      text("plan", "Describe the plan"),
    ];
  else
    growth.fields = [
      ...[1, 2, 3, 4, 5].map((y) => pct(`growth_y${y}`, `Planned revenue growth in year ${y}`, true)),
      money("budget", "Growth investment planned (EGP)"),
      text("funding", "How will growth be funded?"),
      text("plan", "Describe the plan"),
    ];
  sections.push(growth);
  sections.push(clone("offers"));
  sections.push(clone("uploads"));

  return { profileKey: p.key, profileLabel: p.label, model, unitSingular: p.unitNoun.singular, unitPlural: p.unitNoun.plural, channels, costLines, sections };
}
