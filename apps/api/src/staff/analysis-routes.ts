// Console analysis (US-17, US-50 to US-56): merge suggestions, hotspots, trends, briefings with ratings, the briefing
// email preference and CSV exports. Everything runs under withStaffScope: only the caller's subtree is visible.
import { categoryGroup, CATEGORIES, REPORT_ID_PATTERN } from '@kiezruf/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { staffOf } from '../auth/plugin.js';
import type { AppDeps } from '../deps.js';
import type { Tx } from '../db/client.js';
import { withStaffScope } from '../db/scope.js';
import { parseOr400, sendError } from '../http.js';
import { hotspots, toCsv, trends } from '../analysis/queries.js';

const PublicIdParams = z.object({ publicId: z.string().regex(REPORT_ID_PATTERN) });
const TenantQuery = z.object({ tenantId: z.uuid().optional() });
const TrendsQuery = TenantQuery.extend({ weeks: z.coerce.number().int().min(5).max(52).default(8) });
const ExportQuery = TenantQuery.extend({ from: z.iso.date().optional(), to: z.iso.date().optional() });
const RatingParams = z.object({ id: z.uuid() });
const RatingBody = z.object({ useful: z.boolean(), note: z.string().trim().max(1000).optional() });
const PreferencesBody = z.object({ briefingEmail: z.boolean() });

/** The subtree to analyse: the given tenant (it must be in scope) or, without one, everything in scope. */
async function subtreeOf(tx: Tx, tenantId: string | undefined): Promise<string | undefined | null> {
  if (!tenantId) return undefined;
  const [t] = await tx.execute<{ path: string }>(sql`SELECT path::text AS path FROM tenant WHERE id = ${tenantId} AND path <@ app_scope_paths()`);
  return t ? t.path : null;
}

function inScope(request: FastifyRequest, reply: FastifyReply, deps: AppDeps) {
  return <T>(tenantId: string | undefined, fn: (tx: Tx, subtree: string | undefined) => Promise<T>) =>
    withStaffScope(deps.db, staffOf(request).scope, async (tx) => {
      const subtree = await subtreeOf(tx, tenantId);
      if (subtree === null) return { notFound: true as const };
      return { value: await fn(tx, subtree) };
    });
}

export function staffAnalysisRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: app.requireStaff };

  // Merge suggestions (US-17): same tenant, within 150 m, same category group, most similar photos first.
  app.get('/staff/reports/:publicId/duplicates', guard, async (request, reply) => {
    const params = parseOr400(PublicIdParams, request.params, reply);
    if (!params) return reply;
    const matches = await withStaffScope(deps.db, staffOf(request).scope, async (tx) => {
      const [r] = await tx.execute<{ id: string; category: string }>(sql`SELECT id, category FROM report WHERE public_id = ${params.publicId}`);
      if (!r) return null;
      const group = CATEGORIES.filter((c) => c.group === categoryGroup(r.category)).map((c) => c.key);
      return tx.execute(sql`
        SELECT o.public_id AS "publicId", o.status, COALESCE(s.effective_level, 'Low') AS level, o.created_at AS "createdAt",
               round(ST_Distance(o.location, r.location))::int AS "distanceM",
               (SELECT max(1 - (a.embedding <=> b.embedding))::real FROM photo a, photo b
                 WHERE a.report_id = r.id AND b.report_id = o.id AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
                   AND vector_dims(a.embedding) = vector_dims(b.embedding)) AS similarity
        FROM report r JOIN report o ON o.tenant_id = r.tenant_id AND o.id <> r.id
        LEFT JOIN report_score s ON s.report_id = o.id
        WHERE r.id = ${r.id} AND o.merged_into_id IS NULL AND o.status NOT IN ('rejected', 'merged')
          AND o.category = ANY (${`{${group.join(',')}}`}::text[]) AND ST_DWithin(o.location, r.location, 150)
        ORDER BY similarity DESC NULLS LAST, "distanceM"
        LIMIT 5`);
    });
    if (!matches) return sendError(reply, 404, 'not_found');
    return reply.send({ matches });
  });

  app.get('/staff/hotspots', guard, async (request, reply) => {
    const q = parseOr400(TenantQuery, request.query, reply);
    if (!q) return reply;
    const result = await inScope(request, reply, deps)(q.tenantId, (tx, subtree) => hotspots(tx, subtree));
    if ('notFound' in result) return sendError(reply, 404, 'not_found');
    return reply.send({ clusters: result.value, computedAt: new Date().toISOString() });
  });

  app.get('/staff/trends', guard, async (request, reply) => {
    const q = parseOr400(TrendsQuery, request.query, reply);
    if (!q) return reply;
    const result = await inScope(request, reply, deps)(q.tenantId, (tx, subtree) => trends(tx, q.weeks, subtree));
    if ('notFound' in result) return sendError(reply, 404, 'not_found');
    return reply.send(result.value);
  });

  // The last 8 briefings of one node; without tenantId, of the caller's first grant (US-53).
  app.get('/staff/briefings', guard, async (request, reply) => {
    const q = parseOr400(TenantQuery, request.query, reply);
    if (!q) return reply;
    const briefings = await withStaffScope(deps.db, staffOf(request).scope, async (tx) => {
      const tenantId =
        q.tenantId ??
        (await tx.execute<{ id: string }>(sql`SELECT t.id FROM tenant t WHERE t.path = ANY (app_scope_paths()) ORDER BY nlevel(t.path) DESC, t.path LIMIT 1`))[0]?.id;
      if (!tenantId) return [];
      return tx.execute(sql`
        SELECT b.id, jsonb_build_object('id', t.id, 'name', t.name) AS tenant, b.week_start AS "weekStart", b.generated_at AS "generatedAt",
               b.ai_written AS "aiWritten", b.fallback,
               COALESCE((SELECT jsonb_agg(jsonb_build_object(
                 'id', i.id, 'level', i.level, 'kind', i.kind, 'headline', i.headline, 'text', i.text, 'citations', to_jsonb(i.citations),
                 'myRating', (SELECT jsonb_build_object('useful', r.useful, 'note', r.note) FROM briefing_rating r
                              WHERE r.item_id = i.id AND r.account_id = app_account_id())
               ) ORDER BY i.position) FROM briefing_item i WHERE i.briefing_id = b.id), '[]'::jsonb) AS items
        FROM briefing b JOIN tenant t ON t.id = b.tenant_id
        WHERE b.tenant_id = ${tenantId}
        ORDER BY b.week_start DESC LIMIT 8`);
    });
    return reply.send({ briefings });
  });

  // "Useful" / "Something is wrong" per item (US-54). Rating again replaces the earlier rating.
  app.post('/staff/briefings/items/:id/rating', guard, async (request, reply) => {
    const params = parseOr400(RatingParams, request.params, reply);
    const body = params && parseOr400(RatingBody, request.body, reply);
    if (!params || !body) return reply;
    const ok = await withStaffScope(deps.db, staffOf(request).scope, async (tx) => {
      const [item] = await tx.execute(sql`SELECT 1 FROM briefing_item WHERE id = ${params.id}`);
      if (!item) return false;
      await tx.execute(sql`
        INSERT INTO briefing_rating (item_id, account_id, useful, note) VALUES (${params.id}, app_account_id(), ${body.useful}, ${body.note ?? null})
        ON CONFLICT (item_id, account_id) DO UPDATE SET useful = EXCLUDED.useful, note = EXCLUDED.note, created_at = now()`);
      return true;
    });
    if (!ok) return sendError(reply, 404, 'not_found');
    return reply.code(204).send();
  });

  // Unsubscribe from the Monday email (US-56).
  app.put('/staff/me/preferences', guard, async (request, reply) => {
    const body = parseOr400(PreferencesBody, request.body, reply);
    if (!body) return reply;
    await withStaffScope(deps.db, staffOf(request).scope, (tx) =>
      tx.execute(sql`
        INSERT INTO staff_preference (account_id, briefing_email) VALUES (app_account_id(), ${body.briefingEmail})
        ON CONFLICT (account_id) DO UPDATE SET briefing_email = EXCLUDED.briefing_email`),
    );
    return reply.send({ briefingEmail: body.briefingEmail });
  });

  // CSV for council meetings (US-55).
  app.get('/staff/export/queue.csv', guard, async (request, reply) => {
    const q = parseOr400(ExportQuery, request.query, reply);
    if (!q) return reply;
    const result = await inScope(request, reply, deps)(q.tenantId, (tx, subtree) =>
      tx.execute<Record<string, unknown>>(sql`
        SELECT r.public_id, t.name AS tenant, r.category, r.status, COALESCE(s.effective_level, 'Low') AS level,
               round(COALESCE(s.score, 0)::numeric, 1) AS score,
               (SELECT count(*)::int FROM reaction x WHERE x.report_id = r.id AND x.kind = 'me_too') AS me_too,
               r.created_at, r.updated_at
        FROM report r JOIN tenant t ON t.id = r.tenant_id LEFT JOIN report_score s ON s.report_id = r.id
        WHERE r.merged_into_id IS NULL ${subtree ? sql`AND r.tenant_path <@ ${subtree}::ltree` : sql``}
          ${q.from ? sql`AND r.created_at >= ${q.from}::date` : sql``}
          ${q.to ? sql`AND r.created_at < ${q.to}::date + 1` : sql``}
        ORDER BY COALESCE(s.score, 0) DESC, r.created_at DESC`),
    );
    if ('notFound' in result) return sendError(reply, 404, 'not_found');
    const header = ['public_id', 'tenant', 'category', 'status', 'level', 'score', 'me_too', 'created_at', 'updated_at'];
    return csv(reply, 'kiezruf-queue.csv', toCsv(header, result.value.map((r) => header.map((h) => r[h]))));
  });

  app.get('/staff/export/trends.csv', guard, async (request, reply) => {
    const q = parseOr400(TrendsQuery, request.query, reply);
    if (!q) return reply;
    const result = await inScope(request, reply, deps)(q.tenantId, (tx, subtree) => trends(tx, q.weeks, subtree));
    if ('notFound' in result) return sendError(reply, 404, 'not_found');
    const t = result.value;
    const rows = t.categories.map((c) => [c.category, ...c.counts, Math.round(c.fourWeekAverage * 10) / 10, Math.round(c.change * 10) / 10]);
    return csv(reply, 'kiezruf-trends.csv', toCsv(['category', ...t.weeks, 'four_week_average', 'change'], rows));
  });
}

function csv(reply: FastifyReply, filename: string, body: string) {
  return reply
    .header('content-type', 'text/csv; charset=utf-8')
    .header('content-disposition', `attachment; filename="${filename}"`)
    .send(body);
}
