CREATE TABLE "briefing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"week_start" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ai_written" boolean NOT NULL,
	"fallback" boolean NOT NULL,
	"model" text,
	"prompt_version" text,
	"input_hash" text,
	"dropped_items" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "briefing_delivery" (
	"briefing_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"sent_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	CONSTRAINT "briefing_delivery_briefing_id_account_id_pk" PRIMARY KEY("briefing_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "briefing_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"briefing_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"level" text NOT NULL,
	"kind" text NOT NULL,
	"headline" text NOT NULL,
	"text" text NOT NULL,
	"citations" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "briefing_rating" (
	"item_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"useful" boolean NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "briefing_rating_item_id_account_id_pk" PRIMARY KEY("item_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "category_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"suggested" text NOT NULL,
	"confidence" real,
	"chosen" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_preference" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"briefing_email" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN "ai_category" text;--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN "ai_confidence" real;--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN "processed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "briefing" ADD CONSTRAINT "briefing_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing_delivery" ADD CONSTRAINT "briefing_delivery_briefing_id_briefing_id_fk" FOREIGN KEY ("briefing_id") REFERENCES "public"."briefing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing_delivery" ADD CONSTRAINT "briefing_delivery_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing_item" ADD CONSTRAINT "briefing_item_briefing_id_briefing_id_fk" FOREIGN KEY ("briefing_id") REFERENCES "public"."briefing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing_rating" ADD CONSTRAINT "briefing_rating_item_id_briefing_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."briefing_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing_rating" ADD CONSTRAINT "briefing_rating_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_feedback" ADD CONSTRAINT "category_feedback_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_preference" ADD CONSTRAINT "staff_preference_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "briefing_tenant_week_key" ON "briefing" USING btree ("tenant_id","week_start");--> statement-breakpoint
CREATE INDEX "briefing_item_briefing_idx" ON "briefing_item" USING btree ("briefing_id","position");