-- Tenant isolation in the database (US-42, engineering plan "How isolation is enforced").
--
-- Connection model
--   * Migrations, the seed and background jobs connect as the table owner. The owner is not subject to
--     row-level security.
--   * Staff requests run in a transaction that first does SET LOCAL ROLE kiezruf_staff and sets
--     app.scope_paths (what the caller may read) and app.write_paths (what the caller may change).
--     See src/db/scope.ts. Without those settings kiezruf_staff reads nothing.
--   * Citizen requests use kiezruf_citizen, which can read only the public_report view.
--   * In staging and production the API logs in as a separate, non-owner role that is a member of
--     kiezruf_staff and kiezruf_citizen, so a query that skips the scope step returns no rows.

-- Roles are cluster-wide, so they may already exist when a second database is migrated.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kiezruf_staff') THEN
    CREATE ROLE kiezruf_staff NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kiezruf_citizen') THEN
    CREATE ROLE kiezruf_citizen NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint
GRANT kiezruf_staff, kiezruf_citizen TO CURRENT_USER;--> statement-breakpoint

-- The caller's scope, read from transaction-local settings. Unset or empty means an empty scope.
-- A malformed value raises an error, so the query fails instead of returning rows.
CREATE FUNCTION app_scope_paths() RETURNS ltree[]
LANGUAGE sql STABLE
AS $$ SELECT COALESCE(NULLIF(current_setting('app.scope_paths', true), '')::ltree[], '{}'::ltree[]) $$;--> statement-breakpoint
CREATE FUNCTION app_write_paths() RETURNS ltree[]
LANGUAGE sql STABLE
AS $$ SELECT COALESCE(NULLIF(current_setting('app.write_paths', true), '')::ltree[], '{}'::ltree[]) $$;--> statement-breakpoint

-- A tenant's path is its parent's path plus one label, and it never changes afterwards,
-- because report.tenant_path holds a copy of it.
CREATE FUNCTION tenant_check_path() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_path ltree;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'tenant path and parent cannot change (tenant %)', OLD.path;
  END IF;
  IF NEW.parent_id IS NULL THEN
    IF nlevel(NEW.path) <> 1 THEN
      RAISE EXCEPTION 'root tenant path must have one label, got %', NEW.path;
    END IF;
  ELSE
    SELECT path INTO parent_path FROM tenant WHERE id = NEW.parent_id;
    IF nlevel(NEW.path) <> nlevel(parent_path) + 1 OR NOT (NEW.path <@ parent_path) THEN
      RAISE EXCEPTION 'tenant path % must extend parent path % by one label', NEW.path, parent_path;
    END IF;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER tenant_check_path_insert BEFORE INSERT ON tenant
FOR EACH ROW EXECUTE FUNCTION tenant_check_path();--> statement-breakpoint
CREATE TRIGGER tenant_check_path_update BEFORE UPDATE ON tenant
FOR EACH ROW WHEN (OLD.path IS DISTINCT FROM NEW.path OR OLD.parent_id IS DISTINCT FROM NEW.parent_id)
EXECUTE FUNCTION tenant_check_path();--> statement-breakpoint

-- report.tenant_path always equals the path of report.tenant_id. Callers cannot set it.
CREATE FUNCTION report_set_tenant_path() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT path INTO STRICT NEW.tenant_path FROM tenant WHERE id = NEW.tenant_id;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER report_set_tenant_path BEFORE INSERT OR UPDATE OF tenant_id, tenant_path ON report
FOR EACH ROW EXECUTE FUNCTION report_set_tenant_path();--> statement-breakpoint

-- Row-level security. A table with RLS enabled and no policy for a role returns nothing to that role.
ALTER TABLE report ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE photo ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE account ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE staff_role ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Staff read every report in their subtree: a role inherits to all nodes below it (US-42).
CREATE POLICY report_staff_read ON report FOR SELECT TO kiezruf_staff
USING (tenant_path <@ app_scope_paths());--> statement-breakpoint
-- Staff change a report only when they hold a non-viewer role at the tenant that owns it.
-- Product plan, tenancy rules: "Only the owner edits. Higher levels read and roll up."
CREATE POLICY report_staff_update ON report FOR UPDATE TO kiezruf_staff
USING (tenant_path = ANY (app_write_paths()))
WITH CHECK (tenant_path = ANY (app_write_paths()));--> statement-breakpoint
-- A photo follows its report: the subquery runs as the caller, so the report policy applies to it.
CREATE POLICY photo_staff_read ON photo FOR SELECT TO kiezruf_staff
USING (EXISTS (SELECT 1 FROM report r WHERE r.id = photo.report_id));--> statement-breakpoint

GRANT SELECT ON tenant TO kiezruf_staff, kiezruf_citizen;--> statement-breakpoint
GRANT SELECT ON report, photo TO kiezruf_staff;--> statement-breakpoint
-- Column-level: staff cannot move a report to another tenant or edit what the citizen wrote.
GRANT UPDATE (status, updated_at) ON report TO kiezruf_staff;--> statement-breakpoint

-- What citizens may read about a report: no capture location, no capture time, no author,
-- and (once report_score exists) no score or level (US-24). Reports still being blurred, held in
-- moderation or rejected are not public. The view runs with its owner's rights, so it is not limited
-- by a staff scope.
CREATE VIEW public_report AS
SELECT r.id, r.public_id, r.tenant_id, r.category, r.status, r.description, r.dangerous, r.location,
       r.created_at, r.updated_at
FROM report r
WHERE r.status NOT IN ('processing', 'in_moderation', 'rejected');--> statement-breakpoint
GRANT SELECT ON public_report TO kiezruf_citizen;
