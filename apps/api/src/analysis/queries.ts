// Hotspots (US-50, US-52) and trends (US-51): plain SQL statistics, no model involved. The console runs them under the
// staff role, so row-level security limits them to the caller's scope; the briefing job runs them as the owner for one
// tenant's subtree. Both pass `subtree` to narrow to one tenant.
import { CATEGORIES, LEVELS, type Level } from '@kiezruf/shared';
import { sql, type SQL } from 'drizzle-orm';
import type { Tx } from '../db/client.js';

/** DBSCAN radius and minimum cluster size (US-50: "within 150 m"). */
export const CLUSTER_RADIUS_M = 150;
/** US-52: a place is recurring when 3 or more reports land in its cluster within 30 days. */
export const RECURRING_REPORTS = 3;
export const RECURRING_DAYS = 30;
const HOTSPOT_WINDOW_DAYS = 90;
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export interface Hotspot {
  id: string;
  group: string;
  lat: number;
  lon: number;
  count: number;
  /** The highest level among the cluster's open reports (US-50: cluster colour). */
  level: Level;
  publicIds: string[];
  recurring: boolean;
  weekdayPattern: (typeof WEEKDAYS)[number] | null;
}

const categoryGroups = () => sql`unnest(${`{${CATEGORIES.map((c) => c.key).join(',')}}`}::text[], ${`{${CATEGORIES.map((c) => c.group).join(',')}}`}::text[])`;
const inSubtree = (subtree?: string) => (subtree ? sql`r.tenant_path <@ ${subtree}::ltree` : sql`true`);

/** "mostly Mondays": the weekday of more than half of 3 or more reports, in Berlin time. */
export function weekdayPattern(dates: readonly Date[]): Hotspot['weekdayPattern'] {
  if (dates.length < RECURRING_REPORTS) return null;
  const counts = new Map<string, number>();
  for (const d of dates) {
    const day = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Berlin', weekday: 'short' }).format(d).toLowerCase().slice(0, 3);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const [day, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
  return n * 2 > dates.length ? (day as Hotspot['weekdayPattern']) : null;
}

export async function hotspots(tx: Tx, subtree?: string): Promise<Hotspot[]> {
  const rows = await tx.execute<{
    tenant_id: string; grp: string; cid: number; count: number; lat: number; lon: number;
    public_ids: string[]; level_rank: number | null; recent: string[]; created: string[];
  }>(sql`
    WITH pts AS (
      SELECT r.public_id, r.tenant_id, cg.grp, r.created_at, r.status,
             ST_Transform(r.location::geometry, 25833) AS g, COALESCE(s.effective_level, 'Low') AS lvl
      FROM report r
      JOIN ${categoryGroups()} AS cg(category, grp) ON cg.category = r.category
      LEFT JOIN report_score s ON s.report_id = r.id
      WHERE ${inSubtree(subtree)} AND r.merged_into_id IS NULL
        AND r.status IN ('open', 'acknowledged', 'in_progress', 'forwarded', 'resolved')
        AND r.created_at > now() - make_interval(days => ${HOTSPOT_WINDOW_DAYS})
    ),
    clustered AS (
      SELECT *, ST_ClusterDBSCAN(g, eps := ${CLUSTER_RADIUS_M}, minpoints := 2) OVER (PARTITION BY tenant_id, grp) AS cid FROM pts
    )
    SELECT tenant_id, grp, cid, count(*)::int AS count,
           ST_Y(ST_Transform(ST_Centroid(ST_Collect(g)), 4326)) AS lat, ST_X(ST_Transform(ST_Centroid(ST_Collect(g)), 4326)) AS lon,
           array_agg(public_id ORDER BY created_at) AS public_ids,
           max(CASE lvl WHEN 'Critical' THEN 4 WHEN 'High' THEN 3 WHEN 'Medium' THEN 2 ELSE 1 END) FILTER (WHERE status <> 'resolved') AS level_rank,
           array_agg(created_at::text) FILTER (WHERE created_at > now() - make_interval(days => ${RECURRING_DAYS})) AS recent,
           array_agg(created_at::text) AS created
    FROM clustered WHERE cid IS NOT NULL
    GROUP BY tenant_id, grp, cid
    ORDER BY count(*) DESC`);
  return rows.map((r) => {
    const recent = (r.recent ?? []).map((d) => new Date(d));
    return {
      id: `${r.tenant_id}:${r.grp}:${r.cid}`,
      group: r.grp,
      lat: r.lat,
      lon: r.lon,
      count: r.count,
      level: LEVELS[4 - (r.level_rank ?? 1)]!,
      publicIds: r.public_ids,
      recurring: recent.length >= RECURRING_REPORTS,
      weekdayPattern: weekdayPattern(r.created.map((d) => new Date(d))),
    };
  });
}

export interface Trends {
  weeks: string[];
  categories: { category: string; counts: number[]; fourWeekAverage: number; change: number }[];
  medianHoursToAcknowledge: number | null;
  medianHoursToResolve: number | null;
}

/**
 * Weekly report counts per category for the last `weeks` weeks (Monday starts, Berlin time), with the latest week's
 * change against the average of the 4 weeks before it, and median times to acknowledge and to resolve (US-51).
 */
export async function trends(tx: Tx, weeks = 8, subtree?: string): Promise<Trends> {
  const where: SQL = sql`${inSubtree(subtree)} AND r.merged_into_id IS NULL`;
  const weekRows = await tx.execute<{ ws: string }>(sql`
    SELECT to_char(w, 'YYYY-MM-DD') AS ws FROM generate_series(
      date_trunc('week', now() AT TIME ZONE 'Europe/Berlin') - make_interval(weeks => ${weeks - 1}),
      date_trunc('week', now() AT TIME ZONE 'Europe/Berlin'), interval '1 week') AS w`);
  const weekStarts = weekRows.map((w) => w.ws);
  const counts = await tx.execute<{ category: string; ws: string; n: number }>(sql`
    SELECT r.category, to_char(date_trunc('week', r.created_at AT TIME ZONE 'Europe/Berlin'), 'YYYY-MM-DD') AS ws, count(*)::int AS n
    FROM report r
    WHERE ${where} AND (r.created_at AT TIME ZONE 'Europe/Berlin') >= ${weekStarts[0]}::timestamp
    GROUP BY 1, 2`);
  const byCategory = new Map<string, number[]>();
  for (const row of counts) {
    const series = byCategory.get(row.category) ?? weekStarts.map(() => 0);
    series[weekStarts.indexOf(row.ws)] = row.n;
    byCategory.set(row.category, series);
  }
  const categories = [...byCategory.entries()]
    .map(([category, series]) => {
      const before = series.slice(-5, -1);
      const fourWeekAverage = before.length ? before.reduce((a, b) => a + b, 0) / before.length : 0;
      return { category, counts: series, fourWeekAverage, change: series.at(-1)! - fourWeekAverage };
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || a.category.localeCompare(b.category));

  const median = async (statuses: string[]) => {
    const [row] = await tx.execute<{ h: number | null }>(sql`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (e.at - r.created_at)) / 3600) AS h
      FROM report r
      JOIN LATERAL (
        SELECT min(a.created_at) AS at FROM audit_event a
        WHERE a.report_id = r.id AND a.kind = 'status' AND a.to_value = ANY (${`{${statuses.join(',')}}`}::text[])
      ) e ON e.at IS NOT NULL
      WHERE ${where} AND (r.created_at AT TIME ZONE 'Europe/Berlin') >= ${weekStarts[0]}::timestamp`);
    return row?.h === null || row?.h === undefined ? null : Math.round(Number(row.h) * 10) / 10;
  };
  return {
    weeks: weekStarts,
    categories,
    // The first office reaction counts as acknowledging, whichever status it set.
    medianHoursToAcknowledge: await median(['acknowledged', 'in_progress', 'resolved', 'forwarded']),
    medianHoursToResolve: await median(['resolved']),
  };
}

/** Rows of a CSV file; values with commas, quotes or line breaks are quoted. */
export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
    // A leading =, +, - or @ would run as a formula in spreadsheet programs.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
