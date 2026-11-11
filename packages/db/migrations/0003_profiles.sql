CREATE TABLE "profile_default" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_key" text NOT NULL,
	"assumption_key" text NOT NULL,
	"value" numeric(20, 8) NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "engagement" ADD COLUMN "profile_key" text DEFAULT 'fnb' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "profile_default_uq" ON "profile_default" USING btree ("profile_key","assumption_key");