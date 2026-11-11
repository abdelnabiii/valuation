/**
 * Industry profiles. A profile picks the forecast model, the valuation
 * methods and their default weights, and default values for judgement
 * assumptions. Defaults stay unconfirmed open items until the advisor
 * confirms them; the admin can edit a profile's defaults in Settings.
 */
import type { Channel } from "./types";

export type ForecastModel = "units" | "operating" | "early_stage" | "asset_heavy";

export type MethodKey = "dcf" | "multiples" | "asset" | "nav" | "income_cap" | "vc" | "scorecard" | "round";

export const METHOD_LABELS: Record<MethodKey, string> = {
  dcf: "Discounted cash flow",
  multiples: "Market multiples",
  asset: "Asset-based floor",
  nav: "Net asset value (market value of assets)",
  income_cap: "Income capitalisation (cap rate)",
  vc: "Venture capital method",
  scorecard: "Scorecard method",
  round: "Recent funding round",
};

/** Methods whose result is an equity value (others are enterprise value). */
export const EQUITY_METHODS: MethodKey[] = ["vc", "scorecard", "round"];

export interface ProfileDef {
  key: string;
  label: string;
  family: string;
  model: ForecastModel;
  description: string;
  /** Methods used, in display order. Weights come from `rec.w_<method>` defaults. */
  methods: MethodKey[];
  /** Apply the young-company rule (shift weight from multiples to DCF under 36 months). */
  youngRule: boolean;
  /** Default values for judgement assumptions (override the catalogue default). */
  defaults: Record<string, number>;
  unitNoun: { singular: string; plural: string };
  channelLabels: Record<Channel, string>;
  /** Label for the reliance-on-platform adjustment (the "delivery" channel). */
  platformLabel: string;
  /** Plain description used by the comparables research. */
  compsQuery: string;
  /** Damodaran emerging-markets industry name(s) to look up for multiples. */
  damodaranIndustry: string;
}

const W = (m: Partial<Record<MethodKey, number>>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [`rec.w_${k === "income_cap" ? "income" : k}`, v]));

const DEFAULT_CHANNELS: Record<Channel, string> = {
  dine_in: "Direct sales",
  delivery: "Platforms / marketplaces",
  wholesale: "B2B / wholesale",
  online: "Online / e-commerce",
};

const p = (d: Omit<ProfileDef, "channelLabels" | "platformLabel"> & Partial<Pick<ProfileDef, "channelLabels" | "platformLabel">>): ProfileDef => ({
  channelLabels: DEFAULT_CHANNELS,
  platformLabel: "Platform / marketplace reliance",
  ...d,
});

export const PROFILES: ProfileDef[] = [
  /* ---------------- Multi-site ---------------- */
  p({
    key: "fnb",
    label: "Food & beverage (cafés, restaurants, kiosks)",
    family: "Multi-site",
    model: "units",
    description: "Outlet-by-outlet unit economics, new openings drive growth.",
    methods: ["dcf", "multiples", "asset"],
    youngRule: true,
    defaults: { ...W({ dcf: 0.5, multiples: 0.5, asset: 0 }) },
    unitNoun: { singular: "outlet", plural: "outlets" },
    channelLabels: { dine_in: "Dine-in / takeaway", delivery: "Delivery apps", wholesale: "Wholesale", online: "Online store" },
    platformLabel: "Delivery-app reliance",
    compsQuery: "coffee shop, café, bakery-café, restaurant or quick-service F&B businesses",
    damodaranIndustry: "Restaurant/Dining",
  }),
  p({
    key: "retail",
    label: "Retail chains (stores, pharmacies, showrooms)",
    family: "Multi-site",
    model: "units",
    description: "Store-by-store economics; new stores drive growth.",
    methods: ["dcf", "multiples", "asset"],
    youngRule: true,
    defaults: { ...W({ dcf: 0.5, multiples: 0.5, asset: 0 }), "dcf.nwc_pct": 0.1 },
    unitNoun: { singular: "store", plural: "stores" },
    channelLabels: { dine_in: "In-store", delivery: "Marketplaces / quick-commerce", wholesale: "B2B / wholesale", online: "Own e-commerce" },
    compsQuery: "retail chain, specialty retail, pharmacy chain or consumer retail businesses",
    damodaranIndustry: "Retail (General) / Retail (Special Lines)",
  }),
  p({
    key: "clinics",
    label: "Healthcare clinics and labs",
    family: "Multi-site",
    model: "units",
    description: "Branch economics for clinics, diagnostic labs, dental and physiotherapy centres.",
    methods: ["dcf", "multiples", "asset"],
    youngRule: true,
    defaults: { ...W({ dcf: 0.5, multiples: 0.5, asset: 0 }), "dcf.nwc_pct": 0.05, "dcf.maint_capex_pct": 0.04 },
    unitNoun: { singular: "branch", plural: "branches" },
    channelLabels: { dine_in: "Cash patients", delivery: "Insurance / third-party payers", wholesale: "Corporate contracts", online: "Telemedicine / online" },
    platformLabel: "Payer concentration (insurance)",
    compsQuery: "outpatient clinics, diagnostic laboratories, dental or medical centres",
    damodaranIndustry: "Healthcare Support Services / Hospitals/Healthcare Facilities",
  }),
  p({
    key: "schools",
    label: "Education (schools, nurseries, training centres)",
    family: "Multi-site",
    model: "units",
    description: "Campus economics; enrolment and new campuses drive growth.",
    methods: ["dcf", "multiples", "asset"],
    youngRule: true,
    defaults: { ...W({ dcf: 0.5, multiples: 0.5, asset: 0 }), "dcf.nwc_pct": -0.1 },
    unitNoun: { singular: "campus", plural: "campuses" },
    channelLabels: { dine_in: "Tuition fees", delivery: "Transport and other fees", wholesale: "Corporate / B2B training", online: "Online courses" },
    platformLabel: "Ancillary-revenue reliance",
    compsQuery: "private schools, nurseries, universities or training and education businesses",
    damodaranIndustry: "Education",
  }),
  /* ---------------- Operating businesses ---------------- */
  p({
    key: "manufacturing",
    label: "Manufacturing and industrial",
    family: "Operating business",
    model: "operating",
    description: "Company-level revenue growth and margins; capex and working capital matter.",
    methods: ["dcf", "multiples", "asset"],
    youngRule: true,
    defaults: { ...W({ dcf: 0.5, multiples: 0.5, asset: 0 }), "dcf.nwc_pct": 0.2, "dcf.maint_capex_pct": 0.04, "dcf.da_pct": 0.04 },
    unitNoun: { singular: "plant", plural: "plants" },
    channelLabels: { dine_in: "Domestic sales", delivery: "Distributors / agents", wholesale: "Export sales", online: "Other revenue" },
    platformLabel: "Distributor reliance",
    compsQuery: "manufacturing and industrial companies (food processing, packaging, building materials, chemicals, engineering)",
    damodaranIndustry: "the closest manufacturing industry (e.g. Food Processing, Packaging & Container, Building Materials, Chemical (Diversified), Machinery)",
  }),
  p({
    key: "distribution",
    label: "Distribution and trading",
    family: "Operating business",
    model: "operating",
    description: "Thin margins, working capital and supplier/customer concentration drive value.",
    methods: ["dcf", "multiples", "asset"],
    youngRule: true,
    defaults: { ...W({ dcf: 0.5, multiples: 0.5, asset: 0 }), "dcf.nwc_pct": 0.25, "dcf.maint_capex_pct": 0.01, "dcf.da_pct": 0.01 },
    unitNoun: { singular: "warehouse", plural: "warehouses" },
    channelLabels: { dine_in: "Retail customers", delivery: "Modern trade / chains", wholesale: "Wholesale / traditional trade", online: "Online / other" },
    platformLabel: "Key-account reliance",
    compsQuery: "wholesale distribution, FMCG distribution, trading and import companies",
    damodaranIndustry: "Retail (Distributors) / Food Wholesalers",
  }),
  p({
    key: "services",
    label: "Professional and business services",
    family: "Operating business",
    model: "operating",
    description: "People-driven businesses: agencies, consultancies, outsourcing, facility services.",
    methods: ["dcf", "multiples", "asset"],
    youngRule: true,
    defaults: { ...W({ dcf: 0.5, multiples: 0.5, asset: 0 }), "dcf.nwc_pct": 0.15, "dcf.maint_capex_pct": 0.01, "dcf.da_pct": 0.01 },
    unitNoun: { singular: "office", plural: "offices" },
    channelLabels: { dine_in: "Retainer clients", delivery: "Project work", wholesale: "Outsourcing contracts", online: "Other revenue" },
    platformLabel: "Project-revenue reliance",
    compsQuery: "professional services, marketing agencies, consulting, IT services, outsourcing or facility services companies",
    damodaranIndustry: "Business & Consumer Services / Advertising / Information Services",
  }),
  p({
    key: "logistics",
    label: "Logistics and transport",
    family: "Operating business",
    model: "operating",
    description: "Fleet-heavy operations; capex and utilisation drive value.",
    methods: ["dcf", "multiples", "asset"],
    youngRule: true,
    defaults: { ...W({ dcf: 0.5, multiples: 0.4, asset: 0.1 }), "dcf.nwc_pct": 0.1, "dcf.maint_capex_pct": 0.07, "dcf.da_pct": 0.07 },
    unitNoun: { singular: "depot", plural: "depots" },
    channelLabels: { dine_in: "Contract logistics", delivery: "Last-mile / platforms", wholesale: "Freight forwarding", online: "Other revenue" },
    platformLabel: "Platform reliance",
    compsQuery: "logistics, freight, courier, last-mile delivery or trucking companies",
    damodaranIndustry: "Transportation / Trucking",
  }),
  p({
    key: "construction",
    label: "Construction and contracting",
    family: "Operating business",
    model: "operating",
    description: "Project backlog, working capital and contract concentration drive value.",
    methods: ["dcf", "multiples", "asset"],
    youngRule: true,
    defaults: { ...W({ dcf: 0.45, multiples: 0.45, asset: 0.1 }), "dcf.nwc_pct": 0.2, "dcf.maint_capex_pct": 0.03, "dcf.da_pct": 0.03 },
    unitNoun: { singular: "site", plural: "sites" },
    channelLabels: { dine_in: "Private-sector projects", delivery: "Subcontracting", wholesale: "Government projects", online: "Other revenue" },
    platformLabel: "Main-contractor reliance",
    compsQuery: "construction, contracting, engineering and construction or MEP contractors",
    damodaranIndustry: "Engineering/Construction",
  }),
  p({
    key: "saas",
    label: "Software and subscription (SaaS)",
    family: "Recurring revenue",
    model: "operating",
    description: "Recurring revenue, growth and retention drive value; margins scale with size.",
    methods: ["dcf", "multiples"],
    youngRule: true,
    defaults: {
      ...W({ dcf: 0.5, multiples: 0.5 }),
      "dcf.nwc_pct": -0.05,
      "dcf.maint_capex_pct": 0.02,
      "dcf.da_pct": 0.02,
      "dcf.base.margin_delta": 0.15,
      "dcf.upside.margin_delta": 0.25,
      "dcf.downside.margin_delta": 0.05,
      "mult.w_ebitda": 0.2,
      "mult.w_revenue": 0.8,
      "mult.w_sde": 0,
    },
    unitNoun: { singular: "product", plural: "products" },
    channelLabels: { dine_in: "Subscriptions (recurring)", delivery: "Marketplaces / app stores", wholesale: "Implementation & services", online: "Other revenue" },
    platformLabel: "App-store / marketplace reliance",
    compsQuery: "software-as-a-service, B2B software, fintech software or subscription technology companies, preferably with EV/Revenue or EV/ARR multiples",
    damodaranIndustry: "Software (System & Application) / Software (Internet)",
  }),
  /* ---------------- Early stage ---------------- */
  p({
    key: "startup",
    label: "Early-stage startup (pre-revenue or early revenue)",
    family: "Early stage",
    model: "early_stage",
    description: "Venture capital method, scorecard and recent funding rounds; DCF is not relied on.",
    methods: ["vc", "scorecard", "round", "dcf"],
    youngRule: false,
    defaults: { ...W({ vc: 0.4, scorecard: 0.3, round: 0.3, dcf: 0 }), "adj.dlom": 0.15, "mult.w_ebitda": 0, "mult.w_revenue": 1, "mult.w_sde": 0 },
    unitNoun: { singular: "product", plural: "products" },
    compsQuery: "venture-funded startups and recent funding rounds or acquisitions in Egypt, MENA and other emerging markets, with EV/Revenue multiples",
    damodaranIndustry: "the closest industry to the startup's business (e.g. Software (Internet), Retail (Online), Financial Svcs.)",
  }),
  /* ---------------- Asset-heavy ---------------- */
  p({
    key: "real_estate",
    label: "Real estate (income-producing property)",
    family: "Asset-heavy",
    model: "asset_heavy",
    description: "Net asset value at market value and income capitalisation, with DCF as support.",
    methods: ["nav", "income_cap", "dcf", "multiples"],
    youngRule: false,
    defaults: { ...W({ nav: 0.5, income_cap: 0.3, dcf: 0.2, multiples: 0 }), "dcf.maint_capex_pct": 0.02, "dcf.da_pct": 0.02, "adj.dlom": 0.15 },
    unitNoun: { singular: "property", plural: "properties" },
    channelLabels: { dine_in: "Rental income", delivery: "Service charges", wholesale: "Property sales", online: "Other income" },
    platformLabel: "Anchor-tenant reliance",
    compsQuery: "real estate companies, property developers, REITs and income-producing property transactions (cap rates, P/NAV)",
    damodaranIndustry: "Real Estate (Operations & Services) / R.E.I.T.",
  }),
  p({
    key: "hospitality",
    label: "Hotels and hospitality",
    family: "Asset-heavy",
    model: "asset_heavy",
    description: "Owned hotels and resorts: property value and operating cash flow.",
    methods: ["nav", "income_cap", "dcf", "multiples"],
    youngRule: false,
    defaults: { ...W({ nav: 0.4, income_cap: 0.2, dcf: 0.3, multiples: 0.1 }), "dcf.maint_capex_pct": 0.04, "dcf.da_pct": 0.05 },
    unitNoun: { singular: "property", plural: "properties" },
    channelLabels: { dine_in: "Rooms", delivery: "Online travel agents", wholesale: "Tour operators / groups", online: "Food, beverage and other" },
    platformLabel: "Online-travel-agent reliance",
    compsQuery: "hotels, resorts and hospitality companies or hotel transactions (EV/EBITDA, price per key, cap rates)",
    damodaranIndustry: "Hotel/Gaming",
  }),
];

export const PROFILE_BY_KEY: Record<string, ProfileDef> = Object.fromEntries(PROFILES.map((x) => [x.key, x]));
export const DEFAULT_PROFILE = "fnb";

export function getProfile(key: string | null | undefined): ProfileDef {
  return PROFILE_BY_KEY[key ?? ""] ?? PROFILE_BY_KEY[DEFAULT_PROFILE]!;
}

export const weightKey = (m: MethodKey) => `rec.w_${m === "income_cap" ? "income" : m}`;
