CREATE TYPE "public"."comment_state" AS ENUM('visible', 'held', 'removed');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('status_change', 'go_live');--> statement-breakpoint
CREATE TYPE "public"."push_platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TABLE "comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"body" text NOT NULL,
	"state" "comment_state" DEFAULT 'visible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_body_length" CHECK (char_length("comment"."body") BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE TABLE "comment_flag" (
	"comment_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_flag_comment_id_account_id_pk" PRIMARY KEY("comment_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "follow" (
	"report_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_report_id_account_id_pk" PRIMARY KEY("report_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "go_live_alert" (
	"account_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone,
	CONSTRAINT "go_live_alert_account_id_tenant_id_pk" PRIMARY KEY("account_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"report_id" uuid,
	"tenant_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "notification_setting" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"status_change_push" boolean DEFAULT true NOT NULL,
	"status_change_email" boolean DEFAULT true NOT NULL,
	"go_live_push" boolean DEFAULT true NOT NULL,
	"go_live_email" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_token" (
	"token" text PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"platform" "push_platform" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_flag" ADD CONSTRAINT "comment_flag_comment_id_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_flag" ADD CONSTRAINT "comment_flag_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "go_live_alert" ADD CONSTRAINT "go_live_alert_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "go_live_alert" ADD CONSTRAINT "go_live_alert_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_setting" ADD CONSTRAINT "notification_setting_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_token" ADD CONSTRAINT "push_token_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_report_idx" ON "comment" USING btree ("report_id","created_at");--> statement-breakpoint
CREATE INDEX "follow_account_idx" ON "follow" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "go_live_alert_tenant_idx" ON "go_live_alert" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "notification_pending_idx" ON "notification" USING btree ("created_at") WHERE "notification"."sent_at" IS NULL;--> statement-breakpoint
CREATE INDEX "push_token_account_idx" ON "push_token" USING btree ("account_id");