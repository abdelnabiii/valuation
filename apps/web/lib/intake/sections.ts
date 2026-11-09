/**
 * Intake questionnaire definition. Shared by the client form, the server
 * save handlers, completion scoring and the admin view.
 */

export type FieldType = "text" | "textarea" | "number" | "money" | "pct" | "date" | "month" | "select" | "boolean" | "score";

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  help?: string;
  min?: number;
  max?: number;
}

export interface SectionDef {
  key: string;
  title: string;
  intro: string;
  /** "fields" sections store JSON; structured ones have custom editors. */
  kind: "fields" | "units" | "financials" | "leases" | "capex" | "owner" | "debt" | "uploads";
  fields?: Field[];
}

const yesNo = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export const SECTIONS: SectionDef[] = [
  {
    key: "purpose",
    title: "Purpose and scope",
    intro: "Why the valuation is needed and what is being valued.",
    kind: "fields",
    fields: [
      {
        key: "purpose",
        label: "Purpose of the valuation",
        type: "select",
        required: true,
        options: [
          { value: "fundraising", label: "Fundraising" },
          { value: "sale", label: "Sale of the business" },
          { value: "partner_buyout", label: "Partner entry or buy-out" },
          { value: "franchise", label: "Franchising" },
          { value: "internal", label: "Internal planning" },
          { value: "other", label: "Other" },
        ],
      },
      { key: "stake", label: "Stake being valued (% of equity)", type: "pct", required: true },
      { key: "valuation_date", label: "Preferred valuation date", type: "date", required: true, help: "Usually the last month-end." },
      { key: "deadline", label: "When do you need the result?", type: "date" },
      { key: "notes", label: "Anything else we should know", type: "textarea" },
    ],
  },
  {
    key: "business",
    title: "Business profile",
    intro: "Basic facts about the company and the brand.",
    kind: "fields",
    fields: [
      { key: "brand_name", label: "Brand name", type: "text", required: true },
      { key: "legal_name", label: "Legal entity name", type: "text", required: true },
      {
        key: "legal_form",
        label: "Legal form",
        type: "select",
        required: true,
        options: [
          { value: "llc", label: "LLC" },
          { value: "jsc", label: "Joint stock company" },
          { value: "sole", label: "Sole proprietorship" },
          { value: "partnership", label: "Partnership" },
          { value: "other", label: "Other" },
        ],
      },
      { key: "founded", label: "Year founded", type: "number", required: true, min: 1950, max: 2100 },
      { key: "concept", label: "Concept (e.g. specialty coffee bar, kiosk, roastery)", type: "text", required: true },
      { key: "description", label: "Short description of the business", type: "textarea", required: true },
      { key: "employees", label: "Number of employees", type: "number", required: true, min: 0 },
      { key: "shareholders", label: "Shareholders and percentages", type: "textarea", required: true },
      { key: "website", label: "Website or main social account", type: "text" },
    ],
  },
  { key: "units", title: "Units and locations", intro: "One line per outlet, kiosk, roastery or dark kitchen.", kind: "units" },
  {
    key: "financials",
    title: "Monthly financials",
    intro: "Up to 24 months by unit. Revenue by channel and costs by line, in EGP excluding VAT. Head-office costs go in the Head office tab.",
    kind: "financials",
    fields: [
      { key: "vat_inclusive", label: "Are your sales figures VAT-inclusive?", type: "select", options: yesNo, required: true, help: "We model sales excluding VAT. If yes, we convert." },
      {
        key: "delivery_reporting",
        label: "Are delivery-app sales recorded before or after the app commission?",
        type: "select",
        required: true,
        options: [
          { value: "gross", label: "Before commission (gross), commission recorded as a cost" },
          { value: "net", label: "After commission (net)" },
        ],
      },
    ],
  },
  {
    key: "costs",
    title: "Cost structure",
    intro: "How your costs behave.",
    kind: "fields",
    fields: [
      { key: "imported_cogs_share", label: "Share of COGS that is imported or priced in USD (beans, milk alternatives, packaging)", type: "pct", required: true },
      { key: "bean_sourcing", label: "Where do you buy green or roasted beans?", type: "textarea", required: true },
      { key: "price_increases", label: "Menu price increases in the last 24 months (dates and %)", type: "textarea" },
      { key: "staff_count", label: "Total staff on payroll", type: "number", required: true, min: 0 },
      { key: "head_office_desc", label: "What is included in head-office costs?", type: "textarea" },
    ],
  },
  { key: "owner", title: "Owner pay and one-off items", intro: "Owner salaries and unusual items, so we can normalize earnings.", kind: "owner" },
  { key: "debt", title: "Debt, cash and deposits", intro: "Balances at the valuation date.", kind: "debt" },
  { key: "leases", title: "Lease terms", intro: "One row per unit.", kind: "leases" },
  { key: "capex", title: "Capex and fit-out", intro: "What you spent to build and equip each unit.", kind: "capex" },
  {
    key: "operations",
    title: "Operations",
    intro: "Key operating indicators for the last 3 months.",
    kind: "fields",
    fields: [
      { key: "daily_orders", label: "Average daily orders (all units)", type: "number", required: true, min: 0 },
      { key: "average_ticket", label: "Average ticket (EGP, excl. VAT)", type: "money", required: true },
      { key: "repeat_rate", label: "Share of orders from repeat customers", type: "pct", required: true },
      { key: "delivery_apps", label: "Delivery apps used", type: "text", required: true },
      { key: "delivery_dependency", label: "How dependent are you on delivery apps?", type: "score", required: true, help: "1 = not at all, 5 = could not operate without them." },
      { key: "owner_dependency", label: "How dependent is the business on the owner day-to-day?", type: "score", required: true, help: "1 = runs without the owner, 5 = cannot run without the owner." },
      { key: "inventory_value", label: "Inventory at cost today (EGP)", type: "money", required: true },
      { key: "key_staff", label: "Key staff and roles", type: "textarea" },
    ],
  },
  {
    key: "brand",
    title: "Brand assets and IP",
    intro: "What the brand owns beyond the outlets.",
    kind: "fields",
    fields: [
      { key: "trademark", label: "Is the trademark registered in Egypt?", type: "select", options: yesNo, required: true },
      { key: "trademark_detail", label: "Registration details", type: "text" },
      { key: "social_followers", label: "Social media followers (total)", type: "number", min: 0 },
      { key: "recipes_ip", label: "Recipes, blends, roasting profiles or other IP", type: "textarea" },
      { key: "wholesale_contracts", label: "Wholesale or B2B contracts", type: "textarea" },
    ],
  },
  {
    key: "growth",
    title: "Growth plan and budget",
    intro: "Your plan for the next five years.",
    kind: "fields",
    fields: [
      { key: "units_y1", label: "New units planned in year 1", type: "number", required: true, min: 0 },
      { key: "units_y2", label: "New units planned in year 2", type: "number", required: true, min: 0 },
      { key: "units_y3", label: "New units planned in year 3", type: "number", required: true, min: 0 },
      { key: "units_y4", label: "New units planned in year 4", type: "number", required: true, min: 0 },
      { key: "units_y5", label: "New units planned in year 5", type: "number", required: true, min: 0 },
      { key: "budget", label: "Total growth budget (EGP)", type: "money", required: true },
      { key: "funding", label: "How will growth be funded?", type: "textarea", required: true },
      { key: "plan", label: "Describe the plan", type: "textarea" },
    ],
  },
  {
    key: "offers",
    title: "Offers and past valuations",
    intro: "Any offers received or valuations done before.",
    kind: "fields",
    fields: [
      { key: "has_offers", label: "Have you received any offers?", type: "select", options: yesNo, required: true },
      { key: "offers_detail", label: "Offer details (who, amount, date, terms)", type: "textarea" },
      { key: "has_past_valuations", label: "Has the business been valued before?", type: "select", options: yesNo, required: true },
      { key: "past_valuations", label: "Past valuation details (date, value, by whom)", type: "textarea" },
    ],
  },
  { key: "uploads", title: "Upload P&Ls", intro: "Excel or PDF profit-and-loss statements. We extract figures and confirm them with you.", kind: "uploads" },
];

export const SECTION_BY_KEY = Object.fromEntries(SECTIONS.map((s) => [s.key, s]));

export const REVENUE_CHANNELS = [
  { key: "dine_in", label: "Dine-in / takeaway" },
  { key: "delivery", label: "Delivery apps" },
  { key: "wholesale", label: "Wholesale" },
  { key: "online", label: "Online store" },
] as const;

export const COST_LINES = [
  { key: "cogs", label: "Cost of goods sold" },
  { key: "labour", label: "Labour" },
  { key: "rent", label: "Rent" },
  { key: "delivery_commission", label: "Delivery-app commission" },
  { key: "marketing", label: "Marketing" },
  { key: "utilities", label: "Utilities" },
  { key: "maintenance", label: "Repairs and maintenance" },
  { key: "other_opex", label: "Other operating costs" },
] as const;

export const HEAD_OFFICE_LINE = "head_office";

export const UNIT_FORMATS = [
  { value: "cafe", label: "Café" },
  { value: "kiosk", label: "Kiosk" },
  { value: "roastery", label: "Roastery" },
  { value: "dark_kitchen", label: "Dark kitchen" },
  { value: "drive_thru", label: "Drive-thru" },
];

export const CAPEX_CATEGORIES = [
  { value: "fit_out", label: "Fit-out" },
  { value: "equipment", label: "Equipment" },
  { value: "furniture", label: "Furniture" },
  { value: "other", label: "Other" },
];

export const DEBT_KINDS = [
  { value: "bank_loan", label: "Bank loan" },
  { value: "shareholder_loan", label: "Shareholder loan" },
  { value: "overdraft", label: "Overdraft" },
  { value: "lease_liability", label: "Lease liability (IFRS 16)" },
  { value: "deposit_paid", label: "Deposit paid (refundable)" },
  { value: "deposit_held", label: "Deposit held (owed back)" },
  { value: "cash", label: "Cash and bank balances" },
  { value: "other", label: "Other liability" },
];
