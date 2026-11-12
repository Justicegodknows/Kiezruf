-- Deleting a report cascades to its votes and comments, whose triggers mark the report's score dirty (0008). The report
-- is gone by then, so the insert into report_score failed its foreign key and no report could be deleted. Skip reports
-- that no longer exist.
CREATE OR REPLACE FUNCTION mark_score_dirty(p_report uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  INSERT INTO report_score (report_id)
  SELECT p_report WHERE EXISTS (SELECT 1 FROM report WHERE id = p_report)
  ON CONFLICT (report_id) DO UPDATE SET dirty = true
$$;
