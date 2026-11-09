import {
  pgTable,
  pgEnum,
  text,
  uuid,
  timestamp,
  date,
  numeric,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  unique,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const engagementStatus = pgEnum("engagement_status", [
  "draft",
  "intake_open",
  "submitted",
  "in_review",
  "provisional",
  "final",
]);

export const lineItem = pgEnum("line_item", [
  "revenue",
  "cogs",
  "labour",
  "rent",
  "delivery_commission",
  "marketing",
  "utilities",
  "maintenance",
  "other_opex",
  "head_office",
  "depreciation",
  "interest",
  "tax",
]);

export const channel = pgEnum("channel", ["dine_in", "delivery", "wholesale", "online"]);

export const dataOrigin = pgEnum("data_origin", ["client", "extraction", "admin"]);

export const addbackKind = pgEnum("addback_kind", [
  "owner_pay",
  "one_off",
  "related_party",
  "non_operating",
]);

export const debtKind = pgEnum("debt_kind", [
  "bank_loan",
  "shareholder_loan",
  "overdraft",
  "lease_liability",
  "deposit_paid",
  "deposit_held",
  "cash",
  "other",
]);

export const uploadStatus = pgEnum("upload_status", ["pending", "extracted", "confirmed", "rejected", "failed"]);

export const sourceKind = pgEnum("source_kind", ["macro", "transaction", "listed", "method", "client_document"]);

export const assumptionCategory = pgEnum("assumption_category", ["macro", "market", "model", "scenario", "adjustment"]);

export const comparableKind = pgEnum("comparable_kind", ["transaction", "listed"]);

export const runStatus = pgEnum("run_status", ["provisional", "final"]);

export const exportKind = pgEnum("export_kind", ["xlsx", "docx", "pdf", "pptx"]);

/* ------------------------------------------------------------------ */
/* Access & settings                                                   */
/* ------------------------------------------------------------------ */

export const adminUser = pgTable("admin_user", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull().default("Admin"),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Single-row table (id = 1). */
export const branding = pgTable("branding", {
  id: integer("id").primaryKey().default(1),
  advisorName: text("advisor_name").notNull().default("Your Name"),
  firmName: text("firm_name").notNull().default("Independent Valuation Advisor"),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color").notNull().default("#1F2A44"),
  accentColor: text("accent_color").notNull().default("#8C6D3F"),
  neutralColor: text("neutral_color").notNull().default("#5B6472"),
  typeface: text("typeface").notNull().default("IBM Plex Sans"),
  footerText: text("footer_text").notNull().default("Confidential. Prepared for the addressee only."),
  disclaimerText: text("disclaimer_text").notNull(),
  contactEmail: text("contact_email"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Clients & engagements                                               */
/* ------------------------------------------------------------------ */

export const client = pgTable("client", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  segment: text("segment"),
  isDemo: boolean("is_demo").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const engagement = pgTable("engagement", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => client.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  purpose: text("purpose"),
  scope: text("scope"),
  valuationDate: date("valuation_date"),
  standardOfValue: text("standard_of_value").notNull().default("fair_market_value"),
  premise: text("premise").notNull().default("going_concern"),
  basis: text("basis").notNull().default("control"),
  modelCurrency: text("model_currency").notNull().default("EGP"),
  presentationCurrency: text("presentation_currency").notNull().default("EGP"),
  crossCheckCurrency: text("cross_check_currency").notNull().default("USD"),
  feeCurrency: text("fee_currency").notNull().default("USD"),
  feeAmount: numeric("fee_amount", { precision: 14, scale: 2 }),
  language: text("language").notNull().default("en"),
  market: text("market").notNull().default("EG"),
  status: engagementStatus("status").notNull().default("draft"),
  /** "usd_buildup" (default) or "egp_tbill" (shows double-count warning). */
  discountRateMethod: text("discount_rate_method").notNull().default("usd_buildup"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const intakeLink = pgTable(
  "intake_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagement.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    locked: boolean("locked").notNull().default(false),
    lastSavedAt: timestamp("last_saved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("intake_link_token_idx").on(t.tokenHash)],
);

/* ------------------------------------------------------------------ */
/* Intake data                                                         */
/* ------------------------------------------------------------------ */

export const intakeSection = pgTable(
  "intake_section",
  {
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagement.id, { onDelete: "cascade" }),
    sectionKey: text("section_key").notNull(),
    data: jsonb("data").notNull().default({}),
    completionPct: integer("completion_pct").notNull().default(0),
    updatedBy: text("updated_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("intake_section_pk").on(t.engagementId, t.sectionKey)],
);

export const unit = pgTable("unit", {
  id: uuid("id").primaryKey().defaultRandom(),
  engagementId: uuid("engagement_id")
    .notNull()
    .references(() => engagement.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  format: text("format").notNull().default("cafe"),
  city: text("city"),
  openedOn: date("opened_on"),
  status: text("status").notNull().default("operating"),
  sqm: numeric("sqm", { precision: 10, scale: 2 }),
  seats: integer("seats"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const lease = pgTable("lease", {
  unitId: uuid("unit_id")
    .primaryKey()
    .references(() => unit.id, { onDelete: "cascade" }),
  yearsRemaining: numeric("years_remaining", { precision: 6, scale: 2 }),
  monthlyRentEgp: numeric("monthly_rent_egp", { precision: 16, scale: 2 }),
  escalationPct: numeric("escalation_pct", { precision: 8, scale: 4 }),
  escalationEveryMonths: integer("escalation_every_months"),
  renewalRight: boolean("renewal_right"),
  renewalTerms: text("renewal_terms"),
  depositEgp: numeric("deposit_egp", { precision: 16, scale: 2 }),
  revenueShare: numeric("revenue_share_pct", { precision: 8, scale: 4 }),
});

export const unitCapex = pgTable("unit_capex", {
  id: uuid("id").primaryKey().defaultRandom(),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => unit.id, { onDelete: "cascade" }),
  category: text("category").notNull(), // fit_out | equipment | furniture | other
  description: text("description"),
  costEgp: numeric("cost_egp", { precision: 16, scale: 2 }).notNull(),
  spentOn: date("spent_on"),
  usefulLifeYears: numeric("useful_life_years", { precision: 6, scale: 2 }),
  imported: boolean("imported").notNull().default(false),
});

export const monthlyFinancial = pgTable(
  "monthly_financial",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagement.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => unit.id, { onDelete: "cascade" }),
    period: date("period").notNull(), // first day of month
    lineItem: lineItem("line_item").notNull(),
    channel: channel("channel"),
    amountEgp: numeric("amount_egp", { precision: 16, scale: 2 }).notNull(),
    origin: dataOrigin("origin").notNull().default("client"),
    confirmed: boolean("confirmed").notNull().default(true),
    uploadId: uuid("upload_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("mf_eng_idx").on(t.engagementId, t.period),
    unique("mf_cell_uq").on(t.engagementId, t.unitId, t.period, t.lineItem, t.channel).nullsNotDistinct(),
  ],
);

export const addback = pgTable("addback", {
  id: uuid("id").primaryKey().defaultRandom(),
  engagementId: uuid("engagement_id")
    .notNull()
    .references(() => engagement.id, { onDelete: "cascade" }),
  kind: addbackKind("kind").notNull(),
  description: text("description").notNull(),
  /** Annual amount in the trailing-twelve-month window. */
  amountEgp: numeric("amount_egp", { precision: 16, scale: 2 }).notNull(),
  period: text("period").notNull().default("ttm"),
  recurring: boolean("recurring").notNull().default(false),
  evidenceNote: text("evidence_note"),
  accepted: boolean("accepted").notNull().default(true),
});

export const debtItem = pgTable("debt_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  engagementId: uuid("engagement_id")
    .notNull()
    .references(() => engagement.id, { onDelete: "cascade" }),
  kind: debtKind("kind").notNull(),
  counterparty: text("counterparty"),
  balance: numeric("balance", { precision: 16, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("EGP"),
  ratePct: numeric("rate_pct", { precision: 8, scale: 4 }),
  maturity: date("maturity"),
  note: text("note"),
});

export const upload = pgTable("upload", {
  id: uuid("id").primaryKey().defaultRandom(),
  engagementId: uuid("engagement_id")
    .notNull()
    .references(() => engagement.id, { onDelete: "cascade" }),
  blobUrl: text("blob_url").notNull(),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  status: uploadStatus("status").notNull().default("pending"),
  extractionNote: text("extraction_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const extractionRow = pgTable("extraction_row", {
  id: uuid("id").primaryKey().defaultRandom(),
  uploadId: uuid("upload_id")
    .notNull()
    .references(() => upload.id, { onDelete: "cascade" }),
  rawLabel: text("raw_label").notNull(),
  period: date("period"),
  amount: numeric("amount", { precision: 16, scale: 2 }),
  proposedLineItem: lineItem("proposed_line_item"),
  proposedChannel: channel("proposed_channel"),
  proposedUnitId: uuid("proposed_unit_id"),
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
  decision: text("decision").notNull().default("pending"), // pending | accept | reject
});

/* ------------------------------------------------------------------ */
/* Evidence: sources, assumptions, comparables                         */
/* ------------------------------------------------------------------ */

export const source = pgTable("source", {
  id: uuid("id").primaryKey().defaultRandom(),
  engagementId: uuid("engagement_id").references(() => engagement.id, { onDelete: "cascade" }),
  kind: sourceKind("kind").notNull(),
  title: text("title").notNull(),
  publisher: text("publisher"),
  url: text("url"),
  publishedDate: date("published_date"),
  accessedAt: timestamp("accessed_at", { withTimezone: true }).notNull().defaultNow(),
  excerpt: text("excerpt"),
  retrievedBy: text("retrieved_by").notNull().default("admin"), // admin | research
  accepted: boolean("accepted").notNull().default(false),
});

export const assumption = pgTable(
  "assumption",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id").references(() => engagement.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    value: numeric("value", { precision: 20, scale: 8 }),
    unit: text("unit").notNull(), // pct | egp | x | years | ratio | usd_egp
    category: assumptionCategory("category").notNull(),
    sourceId: uuid("source_id").references(() => source.id, { onDelete: "set null" }),
    asOfDate: date("as_of_date"),
    isPlaceholder: boolean("is_placeholder").notNull().default(false),
    confirmed: boolean("confirmed").notNull().default(false),
    rationale: text("rationale"),
    updatedBy: text("updated_by").notNull().default("system"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("assumption_key_uq").on(t.engagementId, t.key).nullsNotDistinct()],
);

export const comparable = pgTable("comparable", {
  id: uuid("id").primaryKey().defaultRandom(),
  engagementId: uuid("engagement_id").references(() => engagement.id, { onDelete: "cascade" }),
  kind: comparableKind("kind").notNull(),
  name: text("name").notNull(),
  country: text("country"),
  dealDate: date("deal_date"),
  description: text("description"),
  evUsdM: numeric("ev_usd_m", { precision: 16, scale: 4 }),
  evToEbitda: numeric("ev_to_ebitda", { precision: 10, scale: 4 }),
  evToRevenue: numeric("ev_to_revenue", { precision: 10, scale: 4 }),
  priceToSde: numeric("price_to_sde", { precision: 10, scale: 4 }),
  sourceId: uuid("source_id")
    .notNull()
    .references(() => source.id, { onDelete: "restrict" }),
  included: boolean("included").notNull().default(true),
  exclusionReason: text("exclusion_reason"),
});

/* ------------------------------------------------------------------ */
/* Runs, exports, open items, audit                                    */
/* ------------------------------------------------------------------ */

export const valuationRun = pgTable("valuation_run", {
  id: uuid("id").primaryKey().defaultRandom(),
  engagementId: uuid("engagement_id")
    .notNull()
    .references(() => engagement.id, { onDelete: "cascade" }),
  engineVersion: text("engine_version").notNull(),
  inputHash: text("input_hash").notNull(),
  inputsSnapshot: jsonb("inputs_snapshot").notNull(),
  result: jsonb("result").notNull(),
  openItems: jsonb("open_items").notNull(),
  status: runStatus("status").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const exportFile = pgTable("export_file", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .notNull()
    .references(() => valuationRun.id, { onDelete: "cascade" }),
  kind: exportKind("kind").notNull(),
  blobUrl: text("blob_url").notNull(),
  checksum: text("checksum").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const openItemResolution = pgTable(
  "open_item_resolution",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagement.id, { onDelete: "cascade" }),
    itemKey: text("item_key").notNull(),
    resolution: text("resolution").notNull(), // waived
    reason: text("reason").notNull(),
    resolvedBy: text("resolved_by").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("oir_key_idx").on(t.engagementId, t.itemKey)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id"),
    actor: text("actor").notNull(),
    action: text("action").notNull(), // create | update | delete | run | export | login | submit
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    field: text("field"),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    reason: text("reason"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_eng_idx").on(t.engagementId, t.at)],
);

/** Values found by live research or extraction, waiting for the advisor to accept. */
export const researchProposal = pgTable(
  "research_proposal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagement.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // macro | comparable
    targetKey: text("target_key"), // assumption key for macro proposals
    payload: jsonb("payload").notNull(),
    sourceId: uuid("source_id").references(() => source.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"), // pending | accepted | rejected
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rp_eng_idx").on(t.engagementId, t.status)],
);
