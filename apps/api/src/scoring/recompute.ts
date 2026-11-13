// Recomputes priority scores (US-22, US-23, US-26, US-27, US-37) with the shared rules, so the console's breakdown and
// the stored score never disagree. Triggers mark a report's score dirty when its votes, comments or the report change;
// the worker runs this every minute for dirty rows and every hour for all active reports (the score decays with age).
// Runs as the table owner: it reads account ages, which no API role may read.
import {
  DEFAULT_THRESHOLDS,
  detectSpike,
  isSafetyCategory,
  meTooWeight,
  NEW_ACCOUNT_DAYS,
  NEW_ACCOUNT_DISCOUNT,
  priorityLevel,
  scoreBreakdown,
  type Thresholds,
} from '@kiezruf/shared';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';

/** Statuses whose score still matters. Closed and merged reports keep their last score. */
const ACTIVE = sql`('processing', 'in_moderation', 'open', 'acknowledged', 'in_progress', 'forwarded')`;

type Row = {
  report_id: string;
  category: string;
  dangerous: boolean;
  created_at: Date;
  effective_level: string;
  override_level: string | null;
  spike_state: 'none' | 'flagged' | 'confirmed' | 'cleared';
  critical: number | null;
  high: number | null;
  medium: number | null;
};

export async function recomputeScores(db: Db, options: { all?: boolean; now?: Date; limit?: number } = {}): Promise<number> {
  const now = options.now ?? new Date();
  return db.transaction(async (tx) => {
    if (options.all) {
      await tx.execute(sql`
        UPDATE report_score s SET dirty = true FROM report r
        WHERE r.id = s.report_id AND r.status IN ${ACTIVE} AND NOT s.dirty`);
    }
    const rows = await tx.execute<Row>(sql`
      SELECT s.report_id, r.category, r.dangerous, r.created_at, s.effective_level, s.override_level, s.spike_state,
             ts.critical, ts.high, ts.medium
      FROM report_score s
      JOIN report r ON r.id = s.report_id
      LEFT JOIN tenant_settings ts ON ts.tenant_id = r.tenant_id
      WHERE s.dirty
      ORDER BY s.report_id
      LIMIT ${options.limit ?? 1000}
      FOR UPDATE OF s SKIP LOCKED`);

    for (const row of rows) {
      const votes = (
        await tx.execute<{ account_id: string; at: Date; account_created_at: Date }>(sql`
          SELECT x.account_id, x.created_at AS at, a.created_at AS account_created_at
          FROM reaction x JOIN account a ON a.id = x.account_id
          WHERE x.report_id = ${row.report_id} AND x.kind = 'me_too'`)
      ).map((v) => ({ accountId: v.account_id, at: new Date(v.at), accountCreatedAt: new Date(v.account_created_at) }));
      const [counts] = await tx.execute<{ co_reporters: number; commenters: number; danger: number }>(sql`
        SELECT
          (SELECT count(DISTINCT account_id)::int FROM reaction WHERE report_id = ${row.report_id} AND kind = 'co_reporter') AS co_reporters,
          (SELECT count(DISTINCT account_id)::int FROM comment WHERE report_id = ${row.report_id} AND state = 'visible') AS commenters,
          (SELECT count(DISTINCT account_id)::int FROM reaction WHERE report_id = ${row.report_id} AND kind = 'danger') AS danger`);

      // A spike is flagged once; a moderator then confirms or clears it (US-26). Cleared stays cleared.
      const spikeState = row.spike_state === 'none' && detectSpike(votes) ? 'flagged' : row.spike_state;
      const discount = spikeState === 'flagged' || spikeState === 'confirmed';

      // Keep reaction.weight in line with the discount, so the stored votes explain the score.
      await tx.execute(sql`
        UPDATE reaction x SET weight = w.weight
        FROM (
          SELECT x2.report_id, x2.account_id, x2.kind,
                 CASE WHEN ${discount} AND x2.created_at - a.created_at < make_interval(days => ${NEW_ACCOUNT_DAYS})
                      THEN ${NEW_ACCOUNT_DISCOUNT}::real ELSE 1::real END AS weight
          FROM reaction x2 JOIN account a ON a.id = x2.account_id
          WHERE x2.report_id = ${row.report_id} AND x2.kind = 'me_too'
        ) w
        WHERE x.report_id = w.report_id AND x.account_id = w.account_id AND x.kind = w.kind AND x.weight <> w.weight`);

      const thresholds: Thresholds =
        row.critical === null ? DEFAULT_THRESHOLDS : { Critical: row.critical, High: row.high!, Medium: row.medium! };
      const breakdown = scoreBreakdown({
        coReporters: counts!.co_reporters,
        commenters: counts!.commenters,
        meToo: meTooWeight(votes, discount),
        ageHours: Math.max(0, (now.getTime() - new Date(row.created_at).getTime()) / 3_600_000),
        // The reporter's own "Dangerous right now?" counts as the first danger mark.
        dangerMarks: counts!.danger + (row.dangerous ? 1 : 0),
        safetyCategory: isSafetyCategory(row.category),
      });
      const level = priorityLevel(breakdown.score, thresholds);
      const effective = row.override_level ?? level;

      await tx.execute(sql`
        UPDATE report_score SET
          score = ${breakdown.score}, level = ${level}, breakdown = ${JSON.stringify(breakdown)}::jsonb,
          effective_level = ${effective},
          level_changed_at = CASE WHEN effective_level IS DISTINCT FROM ${effective} THEN ${now.toISOString()}::timestamptz ELSE level_changed_at END,
          spike_state = ${spikeState}::spike_state, dirty = false, computed_at = ${now.toISOString()}::timestamptz
        WHERE report_id = ${row.report_id}`);
    }
    return rows.length;
  });
}
