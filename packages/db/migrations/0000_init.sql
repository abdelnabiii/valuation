CREATE TYPE "public"."addback_kind" AS ENUM('owner_pay', 'one_off', 'related_party', 'non_operating');--> statement-breakpoint
CREATE TYPE "public"."assumption_category" AS ENUM('macro', 'market', 'model', 'scenario', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('dine_in', 'delivery', 'wholesale', 'online');--> statement-breakpoint
CREATE TYPE "public"."comparable_kind" AS ENUM('transaction', 'listed');--> statement-breakpoint
CREATE TYPE "public"."data_origin" AS ENUM('client', 'extraction', 'admin');--> statement-breakpoint
CREATE TYPE "public"."debt_kind" AS ENUM('bank_loan', 'shareholder_loan', 'overdraft', 'lease_liability', 'deposit_paid', 'deposit_held', 'cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."engagement_status" AS ENUM('draft', 'intake_open', 'submitted', 'in_review', 'provisional', 'final');--> statement-breakpoint
CREATE TYPE "public"."export_kind" AS ENUM('xlsx', 'docx', 'pdf', 'pptx');--> statement-breakpoint
CREATE TYPE "public"."line_item" AS ENUM('revenue', 'cogs', 'labour', 'rent', 'delivery_commission', 'marketing', 'utilities', 'maintenance', 'other_opex', 'head_office', 'depreciation', 'interest', 'tax');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('provisional', 'final');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('macro', 'transaction', 'listed', 'method', 'client_document');--> statement-breakpoint
CREATE TYPE "public"."upload_status" AS ENUM('pending', 'extracted', 'confirmed', 'rejected', 'failed');--> statement-breakpoint
CREATE TABLE "addback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"kind" "addback_kind" NOT NULL,
	"description" text NOT NULL,
	"amount_egp" numeric(16, 2) NOT NULL,
	"period" text DEFAULT 'ttm' NOT NULL,
	"recurring" boolean DEFAULT false NOT NULL,
	"evidence_note" text,
	"accepted" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text DEFAULT 'Admin' NOT NULL,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "assumption" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"value" numeric(20, 8),
	"unit" text NOT NULL,
	"category" "assumption_category" NOT NULL,
	"source_id" uuid,
	"as_of_date" date,
	"is_placeholder" boolean DEFAULT false NOT NULL,
	"rationale" text,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assumption_key_uq" UNIQUE NULLS NOT DISTINCT("engagement_id","key")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"field" text,
	"old_value" jsonb,
	"new_value" jsonb,
	"reason" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branding" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"advisor_name" text DEFAULT 'Your Name' NOT NULL,
	"firm_name" text DEFAULT 'Independent Valuation Advisor' NOT NULL,
	"logo_url" text,
	"primary_color" text DEFAULT '#1F2A44' NOT NULL,
	"accent_color" text DEFAULT '#8C6D3F' NOT NULL,
	"neutral_color" text DEFAULT '#5B6472' NOT NULL,
	"typeface" text DEFAULT 'IBM Plex Sans' NOT NULL,
	"footer_text" text DEFAULT 'Confidential. Prepared for the addressee only.' NOT NULL,
	"disclaimer_text" text NOT NULL,
	"contact_email" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"segment" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comparable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid,
	"kind" "comparable_kind" NOT NULL,
	"name" text NOT NULL,
	"country" text,
	"deal_date" date,
	"description" text,
	"ev_usd_m" numeric(16, 4),
	"ev_to_ebitda" numeric(10, 4),
	"ev_to_revenue" numeric(10, 4),
	"price_to_sde" numeric(10, 4),
	"source_id" uuid NOT NULL,
	"included" boolean DEFAULT true NOT NULL,
	"exclusion_reason" text
);
--> statement-breakpoint
CREATE TABLE "debt_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"kind" "debt_kind" NOT NULL,
	"counterparty" text,
	"balance" numeric(16, 2) NOT NULL,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"rate_pct" numeric(8, 4),
	"maturity" date,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "engagement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"purpose" text,
	"scope" text,
	"valuation_date" date,
	"standard_of_value" text DEFAULT 'fair_market_value' NOT NULL,
	"premise" text DEFAULT 'going_concern' NOT NULL,
	"basis" text DEFAULT 'control' NOT NULL,
	"model_currency" text DEFAULT 'EGP' NOT NULL,
	"presentation_currency" text DEFAULT 'EGP' NOT NULL,
	"cross_check_currency" text DEFAULT 'USD' NOT NULL,
	"fee_currency" text DEFAULT 'USD' NOT NULL,
	"fee_amount" numeric(14, 2),
	"language" text DEFAULT 'en' NOT NULL,
	"market" text DEFAULT 'EG' NOT NULL,
	"status" "engagement_status" DEFAULT 'draft' NOT NULL,
	"discount_rate_method" text DEFAULT 'usd_buildup' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"kind" "export_kind" NOT NULL,
	"blob_url" text NOT NULL,
	"checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_row" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_id" uuid NOT NULL,
	"raw_label" text NOT NULL,
	"period" date,
	"amount" numeric(16, 2),
	"proposed_line_item" "line_item",
	"proposed_channel" "channel",
	"proposed_unit_id" uuid,
	"confidence" numeric(4, 3),
	"decision" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"locked" boolean DEFAULT false NOT NULL,
	"last_saved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_section" (
	"engagement_id" uuid NOT NULL,
	"section_key" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completion_pct" integer DEFAULT 0 NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lease" (
	"unit_id" uuid PRIMARY KEY NOT NULL,
	"years_remaining" numeric(6, 2),
	"monthly_rent_egp" numeric(16, 2),
	"escalation_pct" numeric(8, 4),
	"escalation_every_months" integer,
	"renewal_right" boolean,
	"renewal_terms" text,
	"deposit_egp" numeric(16, 2),
	"revenue_share_pct" numeric(8, 4)
);
--> statement-breakpoint
CREATE TABLE "monthly_financial" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"unit_id" uuid,
	"period" date NOT NULL,
	"line_item" "line_item" NOT NULL,
	"channel" "channel",
	"amount_egp" numeric(16, 2) NOT NULL,
	"origin" "data_origin" DEFAULT 'client' NOT NULL,
	"confirmed" boolean DEFAULT true NOT NULL,
	"upload_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mf_cell_uq" UNIQUE NULLS NOT DISTINCT("engagement_id","unit_id","period","line_item","channel")
);
--> statement-breakpoint
CREATE TABLE "open_item_resolution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"resolution" text NOT NULL,
	"reason" text NOT NULL,
	"resolved_by" text NOT NULL,
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid,
	"kind" "source_kind" NOT NULL,
	"title" text NOT NULL,
	"publisher" text,
	"url" text,
	"published_date" date,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"excerpt" text,
	"retrieved_by" text DEFAULT 'admin' NOT NULL,
	"accepted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"name" text NOT NULL,
	"format" text DEFAULT 'cafe' NOT NULL,
	"city" text,
	"opened_on" date,
	"status" text DEFAULT 'operating' NOT NULL,
	"sqm" numeric(10, 2),
	"seats" integer,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_capex" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"cost_egp" numeric(16, 2) NOT NULL,
	"spent_on" date,
	"useful_life_years" numeric(6, 2),
	"imported" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"blob_url" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"uploaded_by" text NOT NULL,
	"status" "upload_status" DEFAULT 'pending' NOT NULL,
	"extraction_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "valuation_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"engine_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"inputs_snapshot" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"open_items" jsonb NOT NULL,
	"status" "run_status" NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "addback" ADD CONSTRAINT "addback_engagement_id_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assumption" ADD CONSTRAINT "assumption_engagement_id_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assumption" ADD CONSTRAINT "assumption_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparable" ADD CONSTRAINT "comparable_engagement_id_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparable" ADD CONSTRAINT "comparable_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_item" ADD CONSTRAINT "debt_item_engagement_id_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_file" ADD CONSTRAINT "export_file_run_id_valuation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."valuation_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_row" ADD CONSTRAINT "extraction_row_upload_id_upload_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."upload"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_link" ADD CONSTRAINT "intake_link_engagement_id_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_section" ADD CONSTRAINT "intake_section_engagement_id_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease" ADD CONSTRAINT "lease_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_financial" ADD CONSTRAINT "monthly_financial_engagement_id_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_financial" ADD CONSTRAINT "monthly_financial_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_item_resolution" ADD CONSTRAINT "open_item_resolution_engagement_id_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_engagement_id_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit" ADD CONSTRAINT "unit_engagement_id_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_capex" ADD CONSTRAINT "unit_capex_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload" ADD CONSTRAINT "upload_engagement_id_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuation_run" ADD CONSTRAINT "valuation_run_engagement_id_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_eng_idx" ON "audit_log" USING btree ("engagement_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "intake_link_token_idx" ON "intake_link" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "intake_section_pk" ON "intake_section" USING btree ("engagement_id","section_key");--> statement-breakpoint
CREATE INDEX "mf_eng_idx" ON "monthly_financial" USING btree ("engagement_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "oir_key_idx" ON "open_item_resolution" USING btree ("engagement_id","item_key");