-- Admin console (Phase 2): who may read and change what (US-17, US-22 to US-28, US-33, US-42, US-45, US-46).
--
-- Staff requests run as kiezruf_staff (0002). withStaffScope sets, per transaction:
--   app.scope_paths     subtrees the caller reads (every grant)
--   app.write_paths     tenants whose own reports the caller changes (case worker, tenant admin)
--   app.admin_paths     subtrees the caller administers: staff, settings, contacts (tenant admin, platform admin)
--   app.platform_paths  subtrees where the caller may switch tenants live (platform admin)
--   app.account_id      the staff member, for audit rows
-- Operations that must check several rules at once (forwarding to another tenant, merging, inviting staff,
-- tenant status, bans, forward links) are SECURITY DEFINER functions that check the caller's paths themselves.

CREATE FUNCTION app_admin_paths() RETURNS ltree[]
LANGUAGE sql STABLE
AS $$ SELECT COALESCE(NULLIF(current_setting('app.admin_paths', true), '')::ltree[], '{}'::ltree[]) $$;--> statement-breakpoint
CREATE FUNCTION app_platform_paths() RETURNS ltree[]
LANGUAGE sql STABLE
AS $$ SELECT COALESCE(NULLIF(current_setting('app.platform_paths', true), '')::ltree[], '{}'::ltree[]) $$;--> statement-breakpoint

-- --- Reports -------------------------------------------------------------------------------------------
-- A report forwarded to another tenant stays readable, read-only, in the original tenant's queue (US-45).
DROP POLICY report_staff_read ON report;--> statement-breakpoint
CREATE POLICY report_staff_read ON report FOR SELECT TO kiezruf_staff
USING (tenant_path <@ app_scope_paths() OR forwarded_from_path <@ app_scope_paths());--> statement-breakpoint
GRANT UPDATE (public_note) ON report TO kiezruf_staff;--> statement-breakpoint

-- Citizens see the office's note (US-28). Merged duplicates are not public (US-17).
CREATE OR REPLACE VIEW public_report AS
SELECT r.id, r.public_id, r.tenant_id, r.category, r.status, r.description, r.dangerous, r.location,
       r.created_at, r.updated_at,
       (SELECT count(*) FROM reaction x WHERE x.report_id = r.id AND x.kind = 'me_too')::integer AS me_too_count,
       r.public_note
FROM report r
WHERE r.status NOT IN ('processing', 'in_moderation', 'rejected') AND r.merged_into_id IS NULL;--> statement-breakpoint

-- --- Scores (US-22 to US-27) ---------------------------------------------------------------------------
ALTER TABLE report_score ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT ON report_score TO kiezruf_staff;--> statement-breakpoint
GRANT UPDATE (override_level, override_reason, override_by, override_at, spike_state, spike_reason, dirty)
  ON report_score TO kiezruf_staff;--> statement-breakpoint
CREATE POLICY report_score_staff_read ON report_score FOR SELECT TO kiezruf_staff
USING (EXISTS (SELECT 1 FROM report r WHERE r.id = report_score.report_id));--> statement-breakpoint
CREATE POLICY report_score_staff_update ON report_score FOR UPDATE TO kiezruf_staff
USING (EXISTS (SELECT 1 FROM report r WHERE r.id = report_score.report_id AND r.tenant_path = ANY (app_write_paths())))
WITH CHECK (EXISTS (SELECT 1 FROM report r WHERE r.id = report_score.report_id AND r.tenant_path = ANY (app_write_paths())));--> statement-breakpoint

-- Anything that moves a score marks it for the worker.
CREATE FUNCTION mark_score_dirty(p_report uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  INSERT INTO report_score (report_id) VALUES (p_report)
  ON CONFLICT (report_id) DO UPDATE SET dirty = true
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION mark_score_dirty(uuid) FROM PUBLIC;--> statement-breakpoint
CREATE FUNCTION score_dirty_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_NAME = 'report' THEN
    PERFORM mark_score_dirty(NEW.id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM mark_score_dirty(OLD.report_id);
  ELSE
    PERFORM mark_score_dirty(NEW.report_id);
    IF TG_OP = 'UPDATE' AND OLD.report_id IS DISTINCT FROM NEW.report_id THEN
      PERFORM mark_score_dirty(OLD.report_id);
    END IF;
  END IF;
  RETURN NULL;
END
$$;--> statement-breakpoint
CREATE TRIGGER report_score_dirty AFTER INSERT ON report FOR EACH ROW EXECUTE FUNCTION score_dirty_trigger();--> statement-breakpoint
CREATE TRIGGER reaction_score_dirty AFTER INSERT OR UPDATE OR DELETE ON reaction FOR EACH ROW EXECUTE FUNCTION score_dirty_trigger();--> statement-breakpoint
CREATE TRIGGER comment_score_dirty AFTER INSERT OR UPDATE OF state, report_id OR DELETE ON comment FOR EACH ROW EXECUTE FUNCTION score_dirty_trigger();--> statement-breakpoint
-- Reports from before this migration get a score row too.
INSERT INTO report_score (report_id) SELECT id FROM report ON CONFLICT DO NOTHING;--> statement-breakpoint

-- --- Tenant settings and external contacts (US-23, US-45, US-46) --------------------------------------
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON tenant_settings TO kiezruf_staff;--> statement-breakpoint
CREATE POLICY tenant_settings_staff_read ON tenant_settings FOR SELECT TO kiezruf_staff
USING (EXISTS (SELECT 1 FROM tenant t WHERE t.id = tenant_settings.tenant_id AND t.path <@ app_scope_paths()));--> statement-breakpoint
CREATE POLICY tenant_settings_admin_write ON tenant_settings FOR INSERT TO kiezruf_staff
WITH CHECK (EXISTS (SELECT 1 FROM tenant t WHERE t.id = tenant_settings.tenant_id AND t.path <@ app_admin_paths()));--> statement-breakpoint
CREATE POLICY tenant_settings_admin_update ON tenant_settings FOR UPDATE TO kiezruf_staff
USING (EXISTS (SELECT 1 FROM tenant t WHERE t.id = tenant_settings.tenant_id AND t.path <@ app_admin_paths()))
WITH CHECK (EXISTS (SELECT 1 FROM tenant t WHERE t.id = tenant_settings.tenant_id AND t.path <@ app_admin_paths()));--> statement-breakpoint

-- Contacts saved higher up (e.g. Verkehrslenkung Berlin at Land level) are usable by every tenant below.
ALTER TABLE external_contact ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON external_contact TO kiezruf_staff;--> statement-breakpoint
CREATE POLICY external_contact_staff_read ON external_contact FOR SELECT TO kiezruf_staff
USING (EXISTS (
  SELECT 1 FROM tenant t WHERE t.id = external_contact.tenant_id
  AND (t.path <@ app_scope_paths() OR t.path @> app_scope_paths())
));--> statement-breakpoint
CREATE POLICY external_contact_admin_insert ON external_contact FOR INSERT TO kiezruf_staff
WITH CHECK (EXISTS (SELECT 1 FROM tenant t WHERE t.id = external_contact.tenant_id AND t.path <@ app_admin_paths()));--> statement-breakpoint
CREATE POLICY external_contact_admin_delete ON external_contact FOR DELETE TO kiezruf_staff
USING (EXISTS (SELECT 1 FROM tenant t WHERE t.id = external_contact.tenant_id AND t.path <@ app_admin_paths()));--> statement-breakpoint

-- --- Audit log --------------------------------------------------------------------------------------
ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT ON audit_event TO kiezruf_staff;--> statement-breakpoint
CREATE POLICY audit_event_staff_read ON audit_event FOR SELECT TO kiezruf_staff
USING (
  EXISTS (SELECT 1 FROM report r WHERE r.id = audit_event.report_id)
  OR EXISTS (SELECT 1 FROM tenant t WHERE t.id = audit_event.tenant_id AND t.path <@ app_scope_paths())
);--> statement-breakpoint
CREATE POLICY audit_event_staff_insert ON audit_event FOR INSERT TO kiezruf_staff
WITH CHECK (actor_id = app_account_id());--> statement-breakpoint

-- --- Comments and flags (US-33) -----------------------------------------------------------------------
GRANT UPDATE (state) ON comment TO kiezruf_staff;--> statement-breakpoint
CREATE POLICY comment_staff_moderate ON comment FOR UPDATE TO kiezruf_staff
USING (EXISTS (SELECT 1 FROM report r WHERE r.id = comment.report_id AND r.tenant_path = ANY (app_write_paths())))
WITH CHECK (EXISTS (SELECT 1 FROM report r WHERE r.id = comment.report_id AND r.tenant_path = ANY (app_write_paths())));--> statement-breakpoint

-- --- Forwarding (US-45) -----------------------------------------------------------------------------
ALTER TABLE forward ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT ON forward TO kiezruf_staff;--> statement-breakpoint
CREATE POLICY forward_staff_read ON forward FOR SELECT TO kiezruf_staff
USING (EXISTS (SELECT 1 FROM report r WHERE r.id = forward.report_id));--> statement-breakpoint
-- Staff insert only email forwards directly; tenant forwards go through forward_report_to_tenant().
CREATE POLICY forward_staff_insert ON forward FOR INSERT TO kiezruf_staff
WITH CHECK (
  actor_id = app_account_id() AND contact_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM report r WHERE r.id = forward.report_id AND r.tenant_path = ANY (app_write_paths()))
);--> statement-breakpoint

-- To the parent or a sibling tenant. The report becomes theirs; the original tenant keeps reading it.
CREATE FUNCTION forward_report_to_tenant(p_report uuid, p_target uuid, p_note text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  r report%ROWTYPE;
  target tenant%ROWTYPE;
  parent_path ltree;
BEGIN
  SELECT * INTO r FROM report WHERE id = p_report FOR UPDATE;
  IF NOT FOUND OR NOT (r.tenant_path = ANY (app_write_paths())) THEN
    RAISE EXCEPTION 'read_only' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO target FROM tenant WHERE id = p_target;
  parent_path := subpath(r.tenant_path, 0, nlevel(r.tenant_path) - 1);
  IF NOT FOUND OR target.id = r.tenant_id OR target.status NOT IN ('pilot', 'live')
     OR NOT (target.path = parent_path OR (nlevel(target.path) = nlevel(r.tenant_path) AND target.path <@ parent_path)) THEN
    RAISE EXCEPTION 'invalid_target' USING ERRCODE = 'P0001';
  END IF;
  UPDATE report SET forwarded_from_tenant_id = r.tenant_id, forwarded_from_path = r.tenant_path, tenant_id = p_target,
                    status = 'forwarded', public_note = p_note, updated_at = now()
  WHERE id = p_report;
  INSERT INTO forward (report_id, target_tenant_id, public_note, actor_id) VALUES (p_report, p_target, p_note, app_account_id());
  INSERT INTO audit_event (kind, report_id, tenant_id, actor_id, from_value, to_value, public_note)
  VALUES ('forward', p_report, r.tenant_id, app_account_id(), r.tenant_path::text, target.path::text, p_note);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION forward_report_to_tenant(uuid, uuid, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION forward_report_to_tenant(uuid, uuid, text) TO kiezruf_staff;--> statement-breakpoint

-- The report behind a login-free forward link: public fields, location and blurred photos only. NULL when the token
-- is unknown; expired = true after the link's 90 days (US-45).
CREATE FUNCTION forwarded_report(p_token_hash text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN f.expires_at < now() THEN jsonb_build_object('expired', true) ELSE jsonb_build_object(
    'expired', false,
    'publicId', r.public_id, 'category', r.category, 'status', r.status, 'description', r.description,
    'dangerous', r.dangerous, 'publicNote', f.public_note, 'createdAt', r.created_at, 'forwardedAt', f.created_at,
    'lat', ST_Y(r.location::geometry), 'lon', ST_X(r.location::geometry),
    'tenant', t.name, 'office', t.office,
    'photos', COALESCE((SELECT jsonb_agg(p.public_key ORDER BY p.created_at) FROM photo p
                        WHERE p.report_id = r.id AND p.blur_status = 'done' AND p.public_key IS NOT NULL), '[]'::jsonb)
  ) END
  FROM forward f JOIN report r ON r.id = f.report_id JOIN tenant t ON t.id = r.tenant_id
  WHERE f.token_hash = p_token_hash
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION forwarded_report(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION forwarded_report(text) TO kiezruf_citizen;--> statement-breakpoint

-- --- Merging duplicates (US-17) ---------------------------------------------------------------------
-- Votes, follows and comments move to the kept report without double counting (the reaction key is per account);
-- the duplicate's author becomes a co-reporter (US-22 weight 5).
CREATE FUNCTION merge_report(p_duplicate uuid, p_into uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  dup report%ROWTYPE;
  keep report%ROWTYPE;
BEGIN
  SELECT * INTO dup FROM report WHERE id = p_duplicate FOR UPDATE;
  SELECT * INTO keep FROM report WHERE id = p_into FOR UPDATE;
  IF dup.id IS NULL OR keep.id IS NULL OR NOT (dup.tenant_path = ANY (app_write_paths())) OR NOT (keep.tenant_path = ANY (app_write_paths())) THEN
    RAISE EXCEPTION 'read_only' USING ERRCODE = 'P0001';
  END IF;
  IF dup.id = keep.id OR dup.tenant_id <> keep.tenant_id THEN
    RAISE EXCEPTION 'not_same_tenant' USING ERRCODE = 'P0001';
  END IF;
  IF dup.merged_into_id IS NOT NULL OR keep.merged_into_id IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_target' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO reaction (report_id, account_id, kind, weight, created_at)
  SELECT p_into, account_id, kind, weight, created_at FROM reaction WHERE report_id = p_duplicate
  ON CONFLICT DO NOTHING;
  DELETE FROM reaction WHERE report_id = p_duplicate;
  IF dup.created_by IS NOT NULL AND dup.created_by IS DISTINCT FROM keep.created_by THEN
    INSERT INTO reaction (report_id, account_id, kind) VALUES (p_into, dup.created_by, 'co_reporter') ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO follow (report_id, account_id, created_at)
  SELECT p_into, account_id, created_at FROM follow WHERE report_id = p_duplicate ON CONFLICT DO NOTHING;
  DELETE FROM follow WHERE report_id = p_duplicate;
  UPDATE comment SET report_id = p_into WHERE report_id = p_duplicate;

  UPDATE report SET status = 'merged', merged_into_id = p_into, updated_at = now() WHERE id = p_duplicate;
  INSERT INTO audit_event (kind, report_id, tenant_id, actor_id, from_value, to_value)
  VALUES ('merge', p_duplicate, dup.tenant_id, app_account_id(), dup.public_id, keep.public_id),
         ('merge', p_into, keep.tenant_id, app_account_id(), dup.public_id, keep.public_id);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION merge_report(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION merge_report(uuid, uuid) TO kiezruf_staff;--> statement-breakpoint

-- --- Staff and roles (US-42, US-46) -----------------------------------------------------------------
GRANT SELECT ON staff_role TO kiezruf_staff;--> statement-breakpoint
CREATE POLICY staff_role_staff_read ON staff_role FOR SELECT TO kiezruf_staff
USING (EXISTS (SELECT 1 FROM tenant t WHERE t.id = staff_role.tenant_id AND t.path <@ app_scope_paths()));--> statement-breakpoint

-- Staff at one node with their email, for the Tenants & roles screen.
CREATE FUNCTION staff_at_tenant(p_tenant uuid) RETURNS TABLE (account_id uuid, email text, role staff_role_kind, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT s.account_id, a.email, s.role, s.created_at
  FROM staff_role s JOIN account a ON a.id = s.account_id JOIN tenant t ON t.id = s.tenant_id
  WHERE s.tenant_id = p_tenant AND t.path <@ app_scope_paths() AND a.deleted_at IS NULL
  ORDER BY s.role, a.email
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION staff_at_tenant(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION staff_at_tenant(uuid) TO kiezruf_staff;--> statement-breakpoint

-- Grant a role at a node to an email address, creating the account if needed. Tenant admins grant inside their
-- subtree; only platform admins grant platform_admin.
CREATE FUNCTION invite_staff(p_email text, p_tenant uuid, p_role staff_role_kind) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  node ltree;
  acct uuid;
BEGIN
  SELECT path INTO node FROM tenant WHERE id = p_tenant;
  IF node IS NULL OR NOT (node <@ app_admin_paths()) THEN
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE = 'P0001';
  END IF;
  IF p_role = 'platform_admin' AND NOT (node <@ app_platform_paths()) THEN
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO account (email) VALUES (lower(trim(p_email)))
  ON CONFLICT ((lower(email))) DO UPDATE SET email = account.email
  RETURNING id INTO acct;
  INSERT INTO staff_role (account_id, tenant_id, role) VALUES (acct, p_tenant, p_role)
  ON CONFLICT (account_id, tenant_id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO audit_event (kind, tenant_id, actor_id, to_value, data)
  VALUES ('role_grant', p_tenant, app_account_id(), p_role::text, jsonb_build_object('account', acct));
  RETURN acct;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION invite_staff(text, uuid, staff_role_kind) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION invite_staff(text, uuid, staff_role_kind) TO kiezruf_staff;--> statement-breakpoint

CREATE FUNCTION revoke_staff(p_account uuid, p_tenant uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  node ltree;
  old_role staff_role_kind;
BEGIN
  SELECT path INTO node FROM tenant WHERE id = p_tenant;
  SELECT role INTO old_role FROM staff_role WHERE account_id = p_account AND tenant_id = p_tenant;
  IF node IS NULL OR old_role IS NULL OR NOT (node <@ app_admin_paths()) OR p_account = app_account_id()
     OR (old_role = 'platform_admin' AND NOT (node <@ app_platform_paths())) THEN
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM staff_role WHERE account_id = p_account AND tenant_id = p_tenant;
  DELETE FROM session WHERE account_id = p_account AND kind = 'staff';
  INSERT INTO audit_event (kind, tenant_id, actor_id, from_value, data)
  VALUES ('role_revoke', p_tenant, app_account_id(), old_role::text, jsonb_build_object('account', p_account));
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION revoke_staff(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION revoke_staff(uuid, uuid) TO kiezruf_staff;--> statement-breakpoint

-- --- Tenant status and office (US-46) ---------------------------------------------------------------
-- Only platform admins switch a node live (go-live alerts fire from 0006's trigger); tenant admins rename the office.
CREATE FUNCTION set_tenant_status(p_tenant uuid, p_status tenant_status) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  t tenant%ROWTYPE;
BEGIN
  SELECT * INTO t FROM tenant WHERE id = p_tenant FOR UPDATE;
  IF NOT FOUND OR NOT (t.path <@ app_platform_paths()) THEN
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE = 'P0001';
  END IF;
  UPDATE tenant SET status = p_status WHERE id = p_tenant;
  INSERT INTO audit_event (kind, tenant_id, actor_id, from_value, to_value)
  VALUES ('tenant_status', p_tenant, app_account_id(), t.status::text, p_status::text);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION set_tenant_status(uuid, tenant_status) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION set_tenant_status(uuid, tenant_status) TO kiezruf_staff;--> statement-breakpoint

CREATE FUNCTION set_tenant_office(p_tenant uuid, p_office text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  node ltree;
BEGIN
  SELECT path INTO node FROM tenant WHERE id = p_tenant;
  IF node IS NULL OR NOT (node <@ app_admin_paths()) THEN
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE = 'P0001';
  END IF;
  UPDATE tenant SET office = p_office WHERE id = p_tenant;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION set_tenant_office(uuid, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION set_tenant_office(uuid, text) TO kiezruf_staff;--> statement-breakpoint

-- --- Bans (US-33) -----------------------------------------------------------------------------------
-- Tenant and platform admins ban citizen accounts platform-wide; staff accounts cannot be banned this way.
CREATE FUNCTION ban_account(p_account uuid, p_reason text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF cardinality(app_admin_paths()) = 0 THEN
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM staff_role WHERE account_id = p_account) OR NOT EXISTS (SELECT 1 FROM account WHERE id = p_account) THEN
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE = 'P0001';
  END IF;
  UPDATE account SET banned_at = COALESCE(banned_at, now()) WHERE id = p_account;
  DELETE FROM session WHERE account_id = p_account;
  INSERT INTO audit_event (kind, actor_id, reason, data)
  VALUES ('ban', app_account_id(), p_reason, jsonb_build_object('account', p_account));
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION ban_account(uuid, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION ban_account(uuid, text) TO kiezruf_staff;--> statement-breakpoint

-- --- Staff sign-in (ENG-09) -------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON staff_totp, staff_challenge TO kiezruf_auth;
