-- Analysis and AI (Phase 3): who may read and write the new tables (US-13, US-14, US-17, US-50 to US-56).
-- The photo pipeline, hotspot and briefing jobs run in the worker as the table owner.

-- --- Co-reporting (US-13): "Add my photo to this report" -----------------------------------------------
-- A citizen may add unprocessed photos to a public report as well as to their own, and become its co-reporter.
DROP POLICY photo_citizen_insert ON photo;--> statement-breakpoint
CREATE POLICY photo_citizen_insert ON photo FOR INSERT TO kiezruf_citizen
WITH CHECK (
  blur_status = 'pending' AND public_key IS NULL AND phash IS NULL AND embedding IS NULL
  AND attempts = 0 AND failure_reason IS NULL AND ai_category IS NULL AND processed_at IS NULL
  AND (EXISTS (SELECT 1 FROM report r WHERE r.id = photo.report_id)
       OR EXISTS (SELECT 1 FROM public_report p WHERE p.id = photo.report_id))
);--> statement-breakpoint
DROP POLICY reaction_citizen_insert ON reaction;--> statement-breakpoint
CREATE POLICY reaction_citizen_insert ON reaction FOR INSERT TO kiezruf_citizen
WITH CHECK (
  account_id = app_account_id() AND kind IN ('me_too', 'co_reporter') AND weight = 1
  AND EXISTS (SELECT 1 FROM public_report p WHERE p.id = reaction.report_id)
);--> statement-breakpoint

-- "Already reported?" (US-13): public reports within 150 m in the given categories, most similar photo first.
-- Runs with the owner's rights because citizens cannot read photo embeddings; it returns only public fields.
CREATE FUNCTION duplicate_candidates(p_lon double precision, p_lat double precision, p_categories text[], p_embedding text)
RETURNS TABLE (public_id text, category text, status report_status, distance_m integer, me_too_count integer, photo_key text, similarity real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH here AS (SELECT ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography AS g),
  cand AS (
    SELECT p.id, p.public_id, p.category, p.status, round(ST_Distance(p.location, here.g))::integer AS distance_m, p.me_too_count
    FROM public_report p, here
    WHERE ST_DWithin(p.location, here.g, 150) AND p.category = ANY (p_categories)
  )
  SELECT c.public_id, c.category, c.status, c.distance_m, c.me_too_count,
         (SELECT pp.public_key FROM public_photo pp WHERE pp.report_id = c.id LIMIT 1) AS photo_key,
         CASE WHEN p_embedding IS NULL THEN NULL ELSE (
           SELECT max(1 - (ph.embedding <=> p_embedding::vector))::real FROM photo ph
           WHERE ph.report_id = c.id AND ph.embedding IS NOT NULL AND vector_dims(ph.embedding) = vector_dims(p_embedding::vector)
         ) END AS similarity
  FROM cand c
  ORDER BY similarity DESC NULLS LAST, c.distance_m
  LIMIT 3
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION duplicate_candidates(double precision, double precision, text[], text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION duplicate_candidates(double precision, double precision, text[], text) TO kiezruf_citizen;--> statement-breakpoint

-- --- Category feedback (US-14) ---------------------------------------------------------------------
ALTER TABLE category_feedback ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT INSERT ON category_feedback TO kiezruf_citizen;--> statement-breakpoint
CREATE POLICY category_feedback_citizen_insert ON category_feedback FOR INSERT TO kiezruf_citizen
WITH CHECK (EXISTS (SELECT 1 FROM report r WHERE r.id = category_feedback.report_id));--> statement-breakpoint

-- --- Briefings (US-53, US-54, US-56) ---------------------------------------------------------------
ALTER TABLE briefing ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE briefing_item ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE briefing_rating ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE briefing_delivery ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT ON briefing, briefing_item TO kiezruf_staff;--> statement-breakpoint
CREATE POLICY briefing_staff_read ON briefing FOR SELECT TO kiezruf_staff
USING (EXISTS (SELECT 1 FROM tenant t WHERE t.id = briefing.tenant_id AND t.path <@ app_scope_paths()));--> statement-breakpoint
CREATE POLICY briefing_item_staff_read ON briefing_item FOR SELECT TO kiezruf_staff
USING (EXISTS (SELECT 1 FROM briefing b WHERE b.id = briefing_item.briefing_id));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON briefing_rating TO kiezruf_staff;--> statement-breakpoint
CREATE POLICY briefing_rating_staff_own ON briefing_rating FOR ALL TO kiezruf_staff
USING (account_id = app_account_id())
WITH CHECK (account_id = app_account_id() AND EXISTS (SELECT 1 FROM briefing_item i WHERE i.id = briefing_rating.item_id));--> statement-breakpoint

-- --- Staff preferences (US-56) ---------------------------------------------------------------------
ALTER TABLE staff_preference ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON staff_preference TO kiezruf_staff;--> statement-breakpoint
CREATE POLICY staff_preference_own ON staff_preference FOR ALL TO kiezruf_staff
USING (account_id = app_account_id()) WITH CHECK (account_id = app_account_id());
