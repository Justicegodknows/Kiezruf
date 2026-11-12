// The weekly briefing (US-53, US-54, US-56, D-13, D-14, D-17). Monday 06:00 Europe/Berlin: one briefing per tenant
// that takes reports and per roll-up node with staff. 07:00: emailed to the tenant admins of that node.
//
// Input: the top 20 scored reports, hotspots and trend changes in the node's subtree, with every piece of citizen text
// pseudonymised. The model answers with at most 5 items; items citing anything outside the input are dropped. With
// no valid item (or no AI configured) the briefing falls back to the top reports, not AI-written.
import { createHash } from 'node:crypto';
import { fallbackBriefing, pseudonymise, validateBriefing, type Briefing, type Level } from '@kiezruf/shared';
import { sql } from 'drizzle-orm';
import type { AiProvider } from '../ai/provider.js';
import { PROMPT_VERSION } from '../ai/prompts.js';
import type { Db, Tx } from '../db/client.js';
import type { Mailer } from '../mail/mailer.js';
import { hotspots, trends } from './queries.js';

export const TOP_REPORTS = 20;
const COMMENTS_PER_REPORT = 3;
export const MAX_EMAIL_ATTEMPTS = 5;

/** Monday of `now`'s week in Berlin, as YYYY-MM-DD. */
export function weekStartOf(now: Date): string {
  const berlin = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  const day = (berlin.getDay() + 6) % 7; // Monday = 0
  berlin.setDate(berlin.getDate() - day);
  return `${berlin.getFullYear()}-${String(berlin.getMonth() + 1).padStart(2, '0')}-${String(berlin.getDate()).padStart(2, '0')}`;
}

export interface BriefingInput {
  tenant: string;
  weekStart: string;
  reports: {
    publicId: string;
    category: string;
    level: Level;
    score: number;
    status: string;
    ageDays: number;
    meToo: number;
    description: string | null;
    comments: string[];
  }[];
  hotspots: { group: string; count: number; level: Level; recurring: boolean; weekdayPattern: string | null; publicIds: string[] }[];
  trends: { category: string; lastWeek: number; fourWeekAverage: number; change: number }[];
}

/** Everything the model may use, and nothing more (US-53: "Built only from scores, clusters, trends and comment text in scope"). */
export async function buildBriefingInput(tx: Tx, tenantName: string, subtree: string, weekStart: string): Promise<{ input: BriefingInput; allowedIds: Set<string> }> {
  const top = await tx.execute<{ id: string; public_id: string; category: string; level: Level; score: number; status: string; age_days: number; me_too: number; description: string | null }>(sql`
    SELECT r.id, r.public_id, r.category, COALESCE(s.effective_level, 'Low') AS level, round(COALESCE(s.score, 0)::numeric, 1)::float AS score,
           r.status, floor(extract(epoch FROM now() - r.created_at) / 86400)::int AS age_days,
           (SELECT count(*)::int FROM reaction x WHERE x.report_id = r.id AND x.kind = 'me_too') AS me_too, r.description
    FROM report r LEFT JOIN report_score s ON s.report_id = r.id
    WHERE r.tenant_path <@ ${subtree}::ltree AND r.merged_into_id IS NULL
      AND r.status IN ('open', 'acknowledged', 'in_progress', 'forwarded')
    ORDER BY COALESCE(s.score, 0) DESC, r.created_at DESC
    LIMIT ${TOP_REPORTS}`);
  const reports: BriefingInput['reports'] = [];
  for (const r of top) {
    const comments = await tx.execute<{ body: string }>(sql`
      SELECT body FROM comment WHERE report_id = ${r.id} AND state = 'visible' ORDER BY created_at DESC LIMIT ${COMMENTS_PER_REPORT}`);
    reports.push({
      publicId: r.public_id,
      category: r.category,
      level: r.level,
      score: r.score,
      status: r.status,
      ageDays: r.age_days,
      meToo: r.me_too,
      // D-13: names, emails and phone numbers out before anything leaves for the provider.
      description: r.description ? pseudonymise(r.description) : null,
      comments: comments.map((c) => pseudonymise(c.body)),
    });
  }
  const spots = (await hotspots(tx, subtree)).slice(0, 10).map(({ id: _id, lat: _lat, lon: _lon, ...h }) => h);
  const t = await trends(tx, 5, subtree);
  const input: BriefingInput = {
    tenant: tenantName,
    weekStart,
    reports,
    hotspots: spots,
    trends: t.categories.map((c) => ({ category: c.category, lastWeek: c.counts.at(-1)!, fourWeekAverage: Math.round(c.fourWeekAverage * 10) / 10, change: Math.round(c.change * 10) / 10 })),
  };
  const allowedIds = new Set([...reports.map((r) => r.publicId), ...spots.flatMap((h) => h.publicIds)]);
  return { input, allowedIds };
}

export interface BriefingDeps {
  db: Db;
  ai?: AiProvider;
  log?: (entry: Record<string, unknown>) => void;
}

/** Writes this week's briefing for one tenant node, unless it exists. Returns its id. */
export async function generateBriefing(deps: BriefingDeps, tenantId: string, now: Date): Promise<string> {
  const weekStart = weekStartOf(now);
  const [existing] = await deps.db.execute<{ id: string }>(sql`SELECT id FROM briefing WHERE tenant_id = ${tenantId} AND week_start = ${weekStart}`);
  if (existing) return existing.id;

  const [node] = await deps.db.execute<{ name: string; path: string }>(sql`SELECT name, path::text AS path FROM tenant WHERE id = ${tenantId}`);
  const { input, allowedIds } = await deps.db.transaction((tx) => buildBriefingInput(tx, node!.name, node!.path, weekStart));

  let briefingResult: Briefing & { dropped?: { index: number }[] } = { aiWritten: false, fallback: true, items: [] };
  if (deps.ai && input.reports.length > 0) {
    try {
      briefingResult = validateBriefing(await deps.ai.briefing(input), allowedIds);
    } catch (error) {
      deps.log?.({ job: 'briefing', tenant: tenantId, ai: 'failed', error: error instanceof Error ? error.message : 'unknown' });
    }
  }
  if (briefingResult.items.length === 0) {
    briefingResult = fallbackBriefing(input.reports.map((r) => ({ publicId: r.publicId, level: r.level, category: r.category })));
  }

  return deps.db.transaction(async (tx) => {
    const [row] = await tx.execute<{ id: string }>(sql`
      INSERT INTO briefing (tenant_id, week_start, ai_written, fallback, model, prompt_version, input_hash, dropped_items)
      VALUES (${tenantId}, ${weekStart}, ${briefingResult.aiWritten}, ${briefingResult.fallback},
              ${briefingResult.aiWritten ? deps.ai!.models.chat : null}, ${briefingResult.aiWritten ? PROMPT_VERSION : null},
              ${createHash('sha256').update(JSON.stringify(input)).digest('hex')}, ${briefingResult.dropped?.length ?? 0})
      ON CONFLICT (tenant_id, week_start) DO NOTHING
      RETURNING id`);
    if (!row) {
      const [again] = await tx.execute<{ id: string }>(sql`SELECT id FROM briefing WHERE tenant_id = ${tenantId} AND week_start = ${weekStart}`);
      return again!.id;
    }
    for (const [position, item] of briefingResult.items.entries()) {
      // The model only saw pseudonymised text; its output is filtered again before anyone reads it.
      await tx.execute(sql`
        INSERT INTO briefing_item (briefing_id, position, level, kind, headline, text, citations)
        VALUES (${row.id}, ${position}, ${item.level}, ${item.kind}, ${pseudonymise(item.headline)}, ${pseudonymise(item.text)},
                ${`{${item.citations.join(',')}}`}::text[])`);
    }
    return row.id;
  });
}

/**
 * Every node that gets a briefing: tenants taking reports, and roll-up nodes with staff whose subtree takes reports
 * (US-53: "one briefing per tenant (and per roll-up level)").
 */
export async function runBriefings(deps: BriefingDeps, now: Date): Promise<number> {
  const nodes = await deps.db.execute<{ id: string }>(sql`
    SELECT t.id FROM tenant t
    WHERE EXISTS (SELECT 1 FROM tenant c WHERE c.path <@ t.path AND c.status IN ('pilot', 'live') AND c.boundary IS NOT NULL)
      AND (t.status IN ('pilot', 'live') OR EXISTS (SELECT 1 FROM staff_role s WHERE s.tenant_id = t.id))
    ORDER BY t.path`);
  for (const node of nodes) await generateBriefing(deps, node.id, now);
  return nodes.length;
}

export interface EmailDeps {
  db: Db;
  mailer: Mailer;
  webBaseUrl: string;
}

const LEVEL_DE: Record<string, string> = { Critical: 'Kritisch', High: 'Hoch', Medium: 'Mittel', Low: 'Niedrig' };
const KIND_DE: Record<string, string> = { Urgent: 'Dringend', Watch: 'Beobachten', Improving: 'Wird besser' };

/** The Monday email: the console's items, levels and report links; no photos, no personal data (US-56). */
export function briefingMail(tenant: string, weekStart: string, b: { aiWritten: boolean; fallback: boolean }, items: { level: string; kind: string; headline: string; text: string; citations: string[] }[], webBaseUrl: string) {
  const lines = [
    `Wochenbriefing für ${tenant}, Woche ab ${weekStart}`,
    b.aiWritten ? 'KI-erstellt. Die Entscheidung liegt beim Amt.' : 'Ohne KI erstellt: die Meldungen mit der höchsten Priorität.',
    '',
  ];
  items.forEach((item, i) => {
    lines.push(`${i + 1}. [${LEVEL_DE[item.level] ?? item.level} · ${KIND_DE[item.kind] ?? item.kind}] ${item.headline}`);
    if (item.text) lines.push(item.text);
    lines.push(...item.citations.map((id) => `   ${id}: ${webBaseUrl}/console/reports/${id}`), '');
  });
  lines.push(`In der Konsole bewerten: ${webBaseUrl}/console`, '', 'Diese E-Mail abbestellen: Konsole → Einstellungen.');
  return { subject: `Kiezruf-Wochenbriefing ${tenant} (${weekStart})`, text: lines.join('\n') };
}

/**
 * Sends this week's briefings to the tenant admins of each node (D-17), once each, retrying failures on later runs
 * (US-56: "failed deliveries are retried and logged").
 */
export async function sendBriefingEmails(deps: EmailDeps, now: Date): Promise<{ sent: number; failed: number }> {
  const weekStart = weekStartOf(now);
  await deps.db.execute(sql`
    INSERT INTO briefing_delivery (briefing_id, account_id)
    SELECT b.id, s.account_id
    FROM briefing b
    JOIN staff_role s ON s.tenant_id = b.tenant_id AND s.role = 'tenant_admin'
    JOIN account a ON a.id = s.account_id AND a.deleted_at IS NULL AND a.banned_at IS NULL AND a.email IS NOT NULL
    LEFT JOIN staff_preference p ON p.account_id = s.account_id
    WHERE b.week_start = ${weekStart} AND COALESCE(p.briefing_email, true)
    ON CONFLICT DO NOTHING`);
  const pending = await deps.db.execute<{ briefing_id: string; account_id: string; email: string; tenant: string; ai_written: boolean; fallback: boolean }>(sql`
    SELECT d.briefing_id, d.account_id, a.email, t.name AS tenant, b.ai_written, b.fallback
    FROM briefing_delivery d JOIN briefing b ON b.id = d.briefing_id JOIN tenant t ON t.id = b.tenant_id JOIN account a ON a.id = d.account_id
    WHERE b.week_start = ${weekStart} AND d.sent_at IS NULL AND d.attempts < ${MAX_EMAIL_ATTEMPTS} AND a.email IS NOT NULL`);
  let sent = 0;
  let failed = 0;
  for (const d of pending) {
    const items = await deps.db.execute<{ level: string; kind: string; headline: string; text: string; citations: string[] }>(sql`
      SELECT level, kind, headline, text, citations FROM briefing_item WHERE briefing_id = ${d.briefing_id} ORDER BY position`);
    try {
      await deps.mailer.send({ to: d.email, ...briefingMail(d.tenant, weekStart, { aiWritten: d.ai_written, fallback: d.fallback }, items, deps.webBaseUrl) });
      await deps.db.execute(sql`UPDATE briefing_delivery SET sent_at = now(), attempts = attempts + 1 WHERE briefing_id = ${d.briefing_id} AND account_id = ${d.account_id}`);
      sent++;
    } catch (error) {
      await deps.db.execute(sql`
        UPDATE briefing_delivery SET attempts = attempts + 1, last_error = ${(error instanceof Error ? error.message : 'unknown').slice(0, 500)}
        WHERE briefing_id = ${d.briefing_id} AND account_id = ${d.account_id}`);
      failed++;
    }
  }
  return { sent, failed };
}
