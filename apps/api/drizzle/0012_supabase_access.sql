-- Supabase Auth and the Supabase database (ENG-22).
--
-- 1. Sign-in is Supabase Auth now; sessions and one-time codes live there, not in our tables (dropped in 0011).
--    The functions that ended our sessions no longer need to; Supabase sessions end when its user is deleted or
--    banned, which the API does through the Supabase admin API.
-- 2. Supabase exposes the public schema through its Data API (PostgREST) to the roles anon and authenticated, and
--    gives them grants on new tables by default. None of our data may be reachable that way: every query goes
--    through the API and its own roles (ENG-08). Where those roles exist, their grants are revoked here and for
--    tables created later. Also remove "public" from the project's exposed schemas in the Supabase dashboard.

CREATE OR REPLACE FUNCTION delete_my_account() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  me uuid := app_account_id();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'delete_my_account needs a signed-in citizen';
  END IF;
  -- auth_user_id stays: a Supabase token of the deleted user may be valid for up to an hour, and must not recreate
  -- an account. Signing up again gives a new Supabase user and so a new account.
  UPDATE account SET email = NULL, phone = NULL, deleted_at = COALESCE(deleted_at, now()) WHERE id = me;
  DELETE FROM push_token WHERE account_id = me;
  DELETE FROM follow WHERE account_id = me;
  DELETE FROM go_live_alert WHERE account_id = me;
  DELETE FROM notification_setting WHERE account_id = me;
  DELETE FROM notification WHERE account_id = me AND sent_at IS NULL;
  DELETE FROM staff_role WHERE account_id = me;
  DELETE FROM staff_preference WHERE account_id = me;
  UPDATE report SET created_by = NULL WHERE created_by = me;
END
$$;--> statement-breakpoint

-- Returns the Supabase user id, so the API can ban the sign-in as well.
DROP FUNCTION ban_account(uuid, text);--> statement-breakpoint
CREATE FUNCTION ban_account(p_account uuid, p_reason text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  auth_user uuid;
BEGIN
  IF cardinality(app_admin_paths()) = 0 THEN
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM staff_role WHERE account_id = p_account) OR NOT EXISTS (SELECT 1 FROM account WHERE id = p_account) THEN
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE = 'P0001';
  END IF;
  UPDATE account SET banned_at = COALESCE(banned_at, now()) WHERE id = p_account RETURNING auth_user_id INTO auth_user;
  INSERT INTO audit_event (kind, actor_id, reason, data)
  VALUES ('ban', app_account_id(), p_reason, jsonb_build_object('account', p_account));
  RETURN auth_user;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION ban_account(uuid, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION ban_account(uuid, text) TO kiezruf_staff;--> statement-breakpoint

-- A revoked role takes effect at once: staff routes load the grants on every request.
CREATE OR REPLACE FUNCTION revoke_staff(p_account uuid, p_tenant uuid) RETURNS void
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
  INSERT INTO audit_event (kind, tenant_id, actor_id, from_value, data)
  VALUES ('role_revoke', p_tenant, app_account_id(), old_role::text, jsonb_build_object('account', p_account));
END
$$;--> statement-breakpoint

-- Trigger functions run with the owner's rights; nobody needs to call them directly.
REVOKE ALL ON FUNCTION report_notify_status_change() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION tenant_notify_go_live() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION score_dirty_trigger() FROM PUBLIC;--> statement-breakpoint

-- The sign-in role links Supabase users to accounts.
GRANT UPDATE (auth_user_id, email, verified_at) ON account TO kiezruf_auth;--> statement-breakpoint

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END
$$;
