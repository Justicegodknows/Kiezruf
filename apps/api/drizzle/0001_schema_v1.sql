CREATE TYPE "public"."blur_status" AS ENUM('pending', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('processing', 'in_moderation', 'open', 'acknowledged', 'in_progress', 'resolved', 'rejected', 'forwarded');--> statement-breakpoint
CREATE TYPE "public"."staff_role_kind" AS ENUM('platform_admin', 'tenant_admin', 'case_worker', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('grouping', 'not_live', 'pilot', 'live');--> statement-breakpoint
CREATE TYPE "public"."tenant_type" AS ENUM('country', 'land', 'regierungsbezirk', 'kreis', 'kreisfreie_stadt', 'gemeinde', 'bezirk');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"phone" text,
	"verified_at" timestamp with time zone,
	"locale" text DEFAULT 'de' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "account_has_contact" CHECK ("account"."deleted_at" IS NOT NULL OR "account"."email" IS NOT NULL OR "account"."phone" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"original_key" text NOT NULL,
	"public_key" text,
	"blur_status" "blur_status" DEFAULT 'pending' NOT NULL,
	"phash" text,
	"embedding" vector,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photo_public_only_when_blurred" CHECK ("photo"."public_key" IS NULL OR "photo"."blur_status" = 'done')
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_path" "ltree" DEFAULT ''::ltree NOT NULL,
	"category" text NOT NULL,
	"status" "report_status" DEFAULT 'processing' NOT NULL,
	"description" text,
	"dangerous" boolean DEFAULT false NOT NULL,
	"location" geography(Point,4326) NOT NULL,
	"capture_location" geography(Point,4326) NOT NULL,
	"capture_accuracy_m" real,
	"capture_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_role" (
	"account_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role" "staff_role_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_role_account_id_tenant_id_pk" PRIMARY KEY("account_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "tenant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"path" "ltree" NOT NULL,
	"type" "tenant_type" NOT NULL,
	"name" text NOT NULL,
	"office" text,
	"ags_key" text,
	"code" text,
	"status" "tenant_status" DEFAULT 'grouping' NOT NULL,
	"boundary" geometry(MultiPolygon,4326),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_receiving_complete" CHECK ("tenant"."status" NOT IN ('pilot', 'live') OR ("tenant"."boundary" IS NOT NULL AND "tenant"."code" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_created_by_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_role" ADD CONSTRAINT "staff_role_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_role" ADD CONSTRAINT "staff_role_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant" ADD CONSTRAINT "tenant_parent_id_tenant_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_email_key" ON "account" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "account_phone_key" ON "account" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "photo_report_idx" ON "photo" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_public_id_key" ON "report" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "report_tenant_path_gist" ON "report" USING gist ("tenant_path");--> statement-breakpoint
CREATE INDEX "report_location_gist" ON "report" USING gist ("location");--> statement-breakpoint
CREATE INDEX "report_tenant_status_idx" ON "report" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "report_created_by_idx" ON "report" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "staff_role_tenant_idx" ON "staff_role" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_path_key" ON "tenant" USING btree ("path");--> statement-breakpoint
CREATE INDEX "tenant_path_gist" ON "tenant" USING gist ("path");--> statement-breakpoint
CREATE INDEX "tenant_boundary_gist" ON "tenant" USING gist ("boundary");--> statement-breakpoint
CREATE INDEX "tenant_parent_idx" ON "tenant" USING btree ("parent_id");