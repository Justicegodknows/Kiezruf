-- Citizen sign-in, posting and Me too (US-01, US-03, US-18, US-41, US-44), and who may touch the new tables.
--
-- Connection model (extends 0002). Every API query runs under one of three database roles:
--   kiezruf_auth     sign-in bookkeeping: one-time codes, sessions, creating accounts, loading staff grants.
--                    Used only before the caller is known (src/db/scope.ts: withAuthAccess).
--   kiezruf_citizen  public reads (anonymous) and a signed-in citizen's own writes. app.account_id names
--                    the citizen; policies limit writes and private reads to that account (withCitizenSession).
--   kiezruf_staff    staff reads and changes inside app.scope_paths / app.write_paths (withStaffScope).
-- In staging and production the API's login role must be granted these three roles WITH INHERIT FALSE
-- (PostgreSQL 16), so it holds no privileges until a transaction runs SET LOCAL ROLE. Migrations and the
-- seed run as the table owner. Background jobs (Phase 3) will get their own role.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kiezruf_auth') THEN
    CREATE ROLE kiezruf_auth NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint
GRANT kiezruf_auth TO CURRENT_USER;--> statement-breakpoint

-- The signed-in citizen, or NULL. A malformed value raises an error instead of matching nothing silently.
CREATE FUNCTION app_account_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('app.account_id', true), '')::uuid $$;--> statement-breakpoint

-- Sign-in bookkeeping.
GRANT SELECT, INSERT, UPDATE, DELETE ON login_code, session TO kiezruf_auth;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON account TO kiezruf_auth;--> statement-breakpoint
GRANT SELECT ON staff_role, tenant TO kiezruf_auth;--> statement-breakpoint
CREATE POLICY account_auth_all ON account FOR ALL TO kiezruf_auth USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY staff_role_auth_read ON staff_role FOR SELECT TO kiezruf_auth USING (true);--> statement-breakpoint

-- A citizen reads their own account.
GRANT SELECT (id, email, locale, created_at) ON account TO kiezruf_citizen;--> statement-breakpoint
CREATE POLICY account_citizen_self ON account FOR SELECT TO kiezruf_citizen
USING (id = app_account_id());--> statement-breakpoint

-- A citizen reads their own reports, including ones still being processed ("My reports", US-11), and posts new
-- ones. A new report always starts as 'processing': nothing is public before blur succeeds (US-31).
-- report.tenant_path is set by its trigger, and staff policies from 0002 are unaffected.
GRANT SELECT, INSERT ON report TO kiezruf_citizen;--> statement-breakpoint
CREATE POLICY report_citizen_read_own ON report FOR SELECT TO kiezruf_citizen
USING (created_by = app_account_id());--> statement-breakpoint
CREATE POLICY report_citizen_insert ON report FOR INSERT TO kiezruf_citizen
WITH CHECK (created_by = app_account_id() AND status = 'processing');--> statement-breakpoint

-- Photos of the citizen's own report, as unprocessed originals only. The photo job fills in the rest.
GRANT INSERT ON photo TO kiezruf_citizen;--> statement-breakpoint
CREATE POLICY photo_citizen_insert ON photo FOR INSERT TO kiezruf_citizen
WITH CHECK (
  blur_status = 'pending' AND public_key IS NULL AND phash IS NULL AND embedding IS NULL
  AND EXISTS (SELECT 1 FROM report r WHERE r.id = photo.report_id)
);--> statement-breakpoint

-- Report IDs: the next sequence number for a tenant and year (US-41). Runs with the owner's rights, so callers
-- can advance a sequence but never read or reset report_sequence.
CREATE FUNCTION next_report_sequence(p_tenant_id uuid, p_year integer) RETURNS integer
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  INSERT INTO report_sequence (tenant_id, year, last_value) VALUES (p_tenant_id, p_year, 1)
  ON CONFLICT (tenant_id, year) DO UPDATE SET last_value = report_sequence.last_value + 1
  RETURNING last_value
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION next_report_sequence(uuid, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION next_report_sequence(uuid, integer) TO kiezruf_citizen;--> statement-breakpoint

-- "Not live here yet" attempts (US-44): insert only, nobody but the owner reads them yet.
GRANT INSERT ON demand_signal TO kiezruf_citizen;--> statement-breakpoint

-- Me too (US-18, D-05): one per account and report, undoable, only on reports citizens can see.
ALTER TABLE reaction ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON reaction TO kiezruf_citizen;--> statement-breakpoint
CREATE POLICY reaction_citizen_read_own ON reaction FOR SELECT TO kiezruf_citizen
USING (account_id = app_account_id());--> statement-breakpoint
CREATE POLICY reaction_citizen_insert ON reaction FOR INSERT TO kiezruf_citizen
WITH CHECK (
  account_id = app_account_id() AND kind = 'me_too' AND weight = 1
  AND EXISTS (SELECT 1 FROM public_report p WHERE p.id = reaction.report_id)
);--> statement-breakpoint
CREATE POLICY reaction_citizen_delete ON reaction FOR DELETE TO kiezruf_citizen
USING (account_id = app_account_id() AND kind = 'me_too');--> statement-breakpoint
-- Staff see reactions on reports in their scope, like photos (0002).
GRANT SELECT ON reaction TO kiezruf_staff;--> statement-breakpoint
CREATE POLICY reaction_staff_read ON reaction FOR SELECT TO kiezruf_staff
USING (EXISTS (SELECT 1 FROM report r WHERE r.id = reaction.report_id));--> statement-breakpoint

-- The public view gains the Me too count, which is public (US-18). The score never is (US-24).
CREATE OR REPLACE VIEW public_report AS
SELECT r.id, r.public_id, r.tenant_id, r.category, r.status, r.description, r.dangerous, r.location,
       r.created_at, r.updated_at,
       (SELECT count(*) FROM reaction x WHERE x.report_id = r.id AND x.kind = 'me_too')::integer AS me_too_count
FROM report r
WHERE r.status NOT IN ('processing', 'in_moderation', 'rejected');--> statement-breakpoint

-- Blurred copies of photos on public reports. Originals are never listed (US-16, US-31).
CREATE VIEW public_photo AS
SELECT p.id, p.report_id, p.public_key
FROM photo p
JOIN public_report r ON r.id = p.report_id
WHERE p.blur_status = 'done' AND p.public_key IS NOT NULL;--> statement-breakpoint
GRANT SELECT ON public_photo TO kiezruf_citizen;
