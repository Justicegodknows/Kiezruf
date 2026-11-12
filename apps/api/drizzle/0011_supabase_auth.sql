ALTER TABLE "login_code" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staff_challenge" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staff_totp" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "login_code" CASCADE;--> statement-breakpoint
DROP TABLE "session" CASCADE;--> statement-breakpoint
DROP TABLE "staff_challenge" CASCADE;--> statement-breakpoint
DROP TABLE "staff_totp" CASCADE;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "auth_user_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "account_auth_user_key" ON "account" USING btree ("auth_user_id");--> statement-breakpoint
DROP TYPE "public"."session_kind";