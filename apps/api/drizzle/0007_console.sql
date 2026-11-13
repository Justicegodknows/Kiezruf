CREATE TYPE "public"."audit_kind" AS ENUM('status', 'override', 'forward', 'merge', 'spike', 'comment', 'ban', 'role_grant', 'role_revoke', 'tenant_status', 'settings', 'contact');--> statement-breakpoint
CREATE TYPE "public"."spike_state" AS ENUM('none', 'flagged', 'confirmed', 'cleared');--> statement-breakpoint
ALTER TYPE "public"."report_status" ADD VALUE 'merged';--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "audit_kind" NOT NULL,
	"report_id" uuid,
	"tenant_id" uuid,
	"actor_id" uuid,
	"from_value" text,
	"to_value" text,
	"public_note" text,
	"reason" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forward" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"target_tenant_id" uuid,
	"contact_id" uuid,
	"token_hash" text,
	"expires_at" timestamp with time zone,
	"public_note" text,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forward_one_target" CHECK (("forward"."target_tenant_id" IS NULL) <> ("forward"."contact_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "report_score" (
	"report_id" uuid PRIMARY KEY NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"level" text DEFAULT 'Low' NOT NULL,
	"breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"override_level" text,
	"override_reason" text,
	"override_by" uuid,
	"override_at" timestamp with time zone,
	"effective_level" text DEFAULT 'Low' NOT NULL,
	"level_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"spike_state" "spike_state" DEFAULT 'none' NOT NULL,
	"spike_reason" text,
	"dirty" boolean DEFAULT true NOT NULL,
	"computed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "staff_challenge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "staff_totp" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"secret_enc" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"last_step" integer
);
--> statement-breakpoint
CREATE TABLE "tenant_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"critical" real DEFAULT 60 NOT NULL,
	"high" real DEFAULT 25 NOT NULL,
	"medium" real DEFAULT 10 NOT NULL,
	CONSTRAINT "tenant_settings_falling" CHECK ("tenant_settings"."critical" > "tenant_settings"."high" AND "tenant_settings"."high" > "tenant_settings"."medium" AND "tenant_settings"."medium" > 0)
);
--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "banned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "public_note" text;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "merged_into_id" uuid;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "forwarded_from_tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "forwarded_from_path" "ltree";--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_id_account_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_contact" ADD CONSTRAINT "external_contact_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forward" ADD CONSTRAINT "forward_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forward" ADD CONSTRAINT "forward_target_tenant_id_tenant_id_fk" FOREIGN KEY ("target_tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forward" ADD CONSTRAINT "forward_contact_id_external_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."external_contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forward" ADD CONSTRAINT "forward_actor_id_account_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_score" ADD CONSTRAINT "report_score_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_score" ADD CONSTRAINT "report_score_override_by_account_id_fk" FOREIGN KEY ("override_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_challenge" ADD CONSTRAINT "staff_challenge_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_totp" ADD CONSTRAINT "staff_totp_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_event_report_idx" ON "audit_event" USING btree ("report_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_event_tenant_idx" ON "audit_event" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "external_contact_tenant_idx" ON "external_contact" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "forward_report_idx" ON "forward" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "forward_token_key" ON "forward" USING btree ("token_hash");--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_merged_into_id_report_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."report"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_forwarded_from_tenant_id_tenant_id_fk" FOREIGN KEY ("forwarded_from_tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;