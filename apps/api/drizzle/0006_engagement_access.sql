-- Comments, follow, notifications, go-live alerts and account changes (US-19, US-20, US-29, US-34, US-35, US-44).
-- Same connection model as 0002 and 0004: citizens act through kiezruf_citizen with app.account_id set;
-- staff read through kiezruf_staff inside their scope. The notification outbox is written only by the
-- triggers below and read only by the worker, which connects as the table owner.

-- --- Comments (US-19) ---------------------------------------------------------------------------------
ALTER TABLE comment ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT ON comment TO kiezruf_citizen;--> statement-breakpoint
CREATE POLICY comment_citizen_read_own ON comment FOR SELECT TO kiezruf_citizen
USING (account_id = app_account_id());--> statement-breakpoint
-- New comments are visible or held by the language filter; only staff remove them.
CREATE POLICY comment_citizen_insert ON comment FOR INSERT TO kiezruf_citizen
WITH CHECK (
  account_id = app_account_id() AND state IN ('visible', 'held')
  AND EXISTS (SELECT 1 FROM public_report p WHERE p.id = comment.report_id)
);--> statement-breakpoint
-- Staff see comments on reports in their scope, like photos and reactions.
GRANT SELECT ON comment TO kiezruf_staff;--> statement-breakpoint
CREATE POLICY comment_staff_read ON comment FOR SELECT TO kiezruf_staff
USING (EXISTS (SELECT 1 FROM report r WHERE r.id = comment.report_id));--> statement-breakpoint

-- What citizens see: visible comments on public reports, without the author.
CREATE VIEW public_comment AS
SELECT c.id, c.report_id, c.body, c.created_at
FROM comment c
JOIN public_report r ON r.id = c.report_id
WHERE c.state = 'visible';--> statement-breakpoint
GRANT SELECT ON public_comment TO kiezruf_citizen;--> statement-breakpoint

ALTER TABLE comment_flag ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT INSERT ON comment_flag TO kiezruf_citizen;--> statement-breakpoint
CREATE POLICY comment_flag_citizen_insert ON comment_flag FOR INSERT TO kiezruf_citizen
WITH CHECK (
  account_id = app_account_id()
  AND EXISTS (SELECT 1 FROM public_comment c WHERE c.id = comment_flag.comment_id)
);--> statement-breakpoint
GRANT SELECT ON comment_flag TO kiezruf_staff;--> statement-breakpoint
CREATE POLICY comment_flag_staff_read ON comment_flag FOR SELECT TO kiezruf_staff
USING (EXISTS (SELECT 1 FROM comment c WHERE c.id = comment_flag.comment_id));--> statement-breakpoint

-- --- Follow (US-20) -----------------------------------------------------------------------------------
ALTER TABLE follow ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON follow TO kiezruf_citizen;--> statement-breakpoint
CREATE POLICY follow_citizen_own ON follow FOR ALL TO kiezruf_citizen
USING (account_id = app_account_id())
WITH CHECK (
  account_id = app_account_id()
  -- A public report, or the citizen's own report while it is still being processed.
  AND (EXISTS (SELECT 1 FROM public_report p WHERE p.id = follow.report_id)
       OR EXISTS (SELECT 1 FROM report r WHERE r.id = follow.report_id))
);--> statement-breakpoint

-- --- Push tokens and notification settings (US-29) ----------------------------------------------------
ALTER TABLE push_token ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, DELETE ON push_token TO kiezruf_citizen;--> statement-breakpoint
CREATE POLICY push_token_citizen_own ON push_token FOR ALL TO kiezruf_citizen
USING (account_id = app_account_id());--> statement-breakpoint
-- A device token moves to whoever signed in last on that device, even from another account. That needs the
-- owner's rights, so it is a function that only ever writes the caller's own account.
CREATE FUNCTION register_push_token(p_token text, p_platform push_platform) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF app_account_id() IS NULL THEN
    RAISE EXCEPTION 'register_push_token needs a signed-in citizen';
  END IF;
  INSERT INTO push_token (token, account_id, platform, updated_at)
  VALUES (p_token, app_account_id(), p_platform, now())
  ON CONFLICT (token) DO UPDATE SET account_id = EXCLUDED.account_id, platform = EXCLUDED.platform, updated_at = now();
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION register_push_token(text, push_platform) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION register_push_token(text, push_platform) TO kiezruf_citizen;--> statement-breakpoint

ALTER TABLE notification_setting ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON notification_setting TO kiezruf_citizen;--> statement-breakpoint
CREATE POLICY notification_setting_citizen_own ON notification_setting FOR ALL TO kiezruf_citizen
USING (account_id = app_account_id()) WITH CHECK (account_id = app_account_id());--> statement-breakpoint

-- --- Go-live alerts (US-44) ---------------------------------------------------------------------------
ALTER TABLE go_live_alert ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT ON go_live_alert TO kiezruf_citizen;--> statement-breakpoint
CREATE POLICY go_live_alert_citizen_own ON go_live_alert FOR ALL TO kiezruf_citizen
USING (account_id = app_account_id())
WITH CHECK (account_id = app_account_id() AND notified_at IS NULL);--> statement-breakpoint

-- --- Notification outbox ------------------------------------------------------------------------------
-- No grants: only the triggers (owner's rights) write it and only the worker (owner) reads it.
ALTER TABLE notification ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Every status change a citizen can see goes to the report's followers (US-20). Changes out of 'processing'
-- or 'in_moderation' are the system publishing the report, not news for followers.
CREATE FUNCTION report_notify_status_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status IN ('processing', 'in_moderation') OR NEW.status IN ('processing', 'in_moderation') THEN
    RETURN NEW;
  END IF;
  INSERT INTO notification (account_id, kind, report_id, payload)
  SELECT f.account_id, 'status_change', NEW.id, jsonb_build_object('status', NEW.status, 'from', OLD.status)
  FROM follow f JOIN account a ON a.id = f.account_id
  WHERE f.report_id = NEW.id AND a.deleted_at IS NULL;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER report_notify_status_change AFTER UPDATE OF status ON report
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION report_notify_status_change();--> statement-breakpoint

-- When a tenant starts taking reports, everyone who asked to be told hears it once (US-44).
CREATE FUNCTION tenant_notify_go_live() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status NOT IN ('pilot', 'live') OR OLD.status IN ('pilot', 'live') THEN
    RETURN NEW;
  END IF;
  INSERT INTO notification (account_id, kind, tenant_id)
  SELECT g.account_id, 'go_live', NEW.id
  FROM go_live_alert g JOIN account a ON a.id = g.account_id
  WHERE g.tenant_id = NEW.id AND g.notified_at IS NULL AND a.deleted_at IS NULL;
  UPDATE go_live_alert SET notified_at = now() WHERE tenant_id = NEW.id AND notified_at IS NULL;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER tenant_notify_go_live AFTER UPDATE OF status ON tenant
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION tenant_notify_go_live();--> statement-breakpoint

-- --- Account changes (US-34, US-35) -------------------------------------------------------------------
GRANT UPDATE (locale) ON account TO kiezruf_citizen;--> statement-breakpoint
CREATE POLICY account_citizen_update_self ON account FOR UPDATE TO kiezruf_citizen
USING (id = app_account_id()) WITH CHECK (id = app_account_id());--> statement-breakpoint

-- Self-service deletion (US-34), immediately rather than within the 30 days the plan allows. Personal data
-- goes: contact details, sessions, devices, follows, alerts, settings, pending notifications and sign-in codes.
-- Reports, comments and votes stay, attributed to "a neighbour": the account row remains, without any contact.
CREATE FUNCTION delete_my_account() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  me uuid := app_account_id();
  old_email text;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'delete_my_account needs a signed-in citizen';
  END IF;
  SELECT email INTO old_email FROM account WHERE id = me;
  UPDATE account SET email = NULL, phone = NULL, deleted_at = COALESCE(deleted_at, now()) WHERE id = me;
  DELETE FROM session WHERE account_id = me;
  DELETE FROM push_token WHERE account_id = me;
  DELETE FROM follow WHERE account_id = me;
  DELETE FROM go_live_alert WHERE account_id = me;
  DELETE FROM notification_setting WHERE account_id = me;
  DELETE FROM notification WHERE account_id = me AND sent_at IS NULL;
  DELETE FROM staff_role WHERE account_id = me;
  IF old_email IS NOT NULL THEN
    DELETE FROM login_code WHERE email = lower(old_email);
  END IF;
  UPDATE report SET created_by = NULL WHERE created_by = me;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION delete_my_account() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION delete_my_account() TO kiezruf_citizen;
