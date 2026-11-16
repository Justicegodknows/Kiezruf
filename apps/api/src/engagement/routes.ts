// Comments (US-19), follow (US-20) and the signed-in citizen's relation to a report.
import { REPORT_ID_PATTERN } from '@kiezruf/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { accountIdOf } from '../auth/plugin.js';
import type { AppDeps } from '../deps.js';
import { withCitizenAccess, withCitizenSession } from '../db/scope.js';
import { parseOr400, sendError } from '../http.js';
import { needsReview } from '../moderation/language.js';

const PublicIdParams = z.object({ publicId: z.string().regex(REPORT_ID_PATTERN) });
const CommentIdParams = z.object({ id: z.uuid() });
const CommentBody = z.object({ body: z.string().trim().min(1).max(500) });
const FlagBody = z.object({ reason: z.string().trim().max(200).optional() }).default({});

export function engagementRoutes(app: FastifyInstance, deps: AppDeps) {
  const perAccount = (max: number, timeWindow: string) => ({
    rateLimit: { max, timeWindow, keyGenerator: (r: { session: { accountId: string } | null; ip: string }) => r.session?.accountId ?? r.ip },
  });

  app.get('/public/reports/:publicId/comments', async (request, reply) => {
    const params = parseOr400(PublicIdParams, request.params, reply);
    if (!params) return reply;
    const result = await withCitizenAccess(deps.db, async (tx) => {
      const [target] = await tx.execute<{ id: string }>(sql`SELECT id FROM public_report WHERE public_id = ${params.publicId}`);
      if (!target) return null;
      return tx.execute(sql`
        SELECT id, body, created_at AS "createdAt" FROM public_comment
        WHERE report_id = ${target.id} ORDER BY created_at, id LIMIT 500`);
    });
    if (!result) return sendError(reply, 404, 'not_found');
    return reply.send({ comments: result });
  });

  // A comment that trips the language filter is stored but held for review, not published (US-19, US-33).
  app.post('/reports/:publicId/comments', { preHandler: app.requireCitizen, config: perAccount(30, '1 hour') }, async (request, reply) => {
    const params = parseOr400(PublicIdParams, request.params, reply);
    const body = params && parseOr400(CommentBody, request.body, reply);
    if (!params || !body) return reply;
    const held = needsReview(body.body);
    const created = await withCitizenSession(deps.db, accountIdOf(request), async (tx) => {
      const [target] = await tx.execute<{ id: string }>(sql`SELECT id FROM public_report WHERE public_id = ${params.publicId}`);
      if (!target) return null;
      const [row] = await tx.execute<{ id: string }>(sql`
        INSERT INTO comment (report_id, account_id, body, state)
        VALUES (${target.id}, app_account_id(), ${body.body}, ${held ? 'held' : 'visible'}::comment_state)
        RETURNING id`);
      return row!;
    });
    if (!created) return sendError(reply, 404, 'not_found');
    return reply.code(201).send({ id: created.id, held });
  });

  app.post('/comments/:id/flag', { preHandler: app.requireCitizen, config: perAccount(60, '1 hour') }, async (request, reply) => {
    const params = parseOr400(CommentIdParams, request.params, reply);
    const body = params && parseOr400(FlagBody, request.body ?? {}, reply);
    if (!params || !body) return reply;
    const found = await withCitizenSession(deps.db, accountIdOf(request), async (tx) => {
      const [visible] = await tx.execute(sql`SELECT 1 FROM public_comment WHERE id = ${params.id}`);
      if (!visible) return false;
      await tx.execute(sql`
        INSERT INTO comment_flag (comment_id, account_id, reason) VALUES (${params.id}, app_account_id(), ${body.reason ?? null})
        ON CONFLICT DO NOTHING`);
      return true;
    });
    if (!found) return sendError(reply, 404, 'not_found');
    return reply.code(204).send();
  });

  app.put('/reports/:publicId/follow', { preHandler: app.requireCitizen }, async (request, reply) => {
    const params = parseOr400(PublicIdParams, request.params, reply);
    if (!params) return reply;
    const ok = await withCitizenSession(deps.db, accountIdOf(request), async (tx) => {
      const id = await followableReportId(tx, params.publicId);
      if (!id) return false;
      await tx.execute(sql`INSERT INTO follow (report_id, account_id) VALUES (${id}, app_account_id()) ON CONFLICT DO NOTHING`);
      return true;
    });
    if (!ok) return sendError(reply, 404, 'not_found');
    return reply.send({ following: true });
  });

  app.delete('/reports/:publicId/follow', { preHandler: app.requireCitizen }, async (request, reply) => {
    const params = parseOr400(PublicIdParams, request.params, reply);
    if (!params) return reply;
    const ok = await withCitizenSession(deps.db, accountIdOf(request), async (tx) => {
      const id = await followableReportId(tx, params.publicId);
      if (!id) return false;
      await tx.execute(sql`DELETE FROM follow WHERE report_id = ${id} AND account_id = app_account_id()`);
      return true;
    });
    if (!ok) return sendError(reply, 404, 'not_found');
    return reply.send({ following: false });
  });

  // The detail screen's signed-in state: does the citizen follow it, did they vote, did they post it?
  app.get('/reports/:publicId/me', { preHandler: app.requireCitizen }, async (request, reply) => {
    const params = parseOr400(PublicIdParams, request.params, reply);
    if (!params) return reply;
    const state = await withCitizenSession(deps.db, accountIdOf(request), async (tx) => {
      const id = await followableReportId(tx, params.publicId);
      if (!id) return null;
      const [row] = await tx.execute<{ following: boolean; meToo: boolean; mine: boolean }>(sql`
        SELECT EXISTS (SELECT 1 FROM follow WHERE report_id = ${id} AND account_id = app_account_id()) AS following,
               EXISTS (SELECT 1 FROM reaction WHERE report_id = ${id} AND account_id = app_account_id() AND kind = 'me_too') AS "meToo",
               EXISTS (SELECT 1 FROM report WHERE id = ${id}) AS mine`);
      return row!;
    });
    if (!state) return sendError(reply, 404, 'not_found');
    return reply.send(state);
  });

  app.get('/me/follows', { preHandler: app.requireCitizen }, async (request, reply) => {
    const rows = await withCitizenSession(deps.db, accountIdOf(request), (tx) =>
      tx.execute(sql`
        SELECT COALESCE(p.public_id, r.public_id) AS "publicId", COALESCE(p.category, r.category) AS category,
               COALESCE(p.status, r.status) AS status, COALESCE(p.updated_at, r.updated_at) AS "updatedAt", t.name AS "tenantName"
        FROM follow f
        LEFT JOIN public_report p ON p.id = f.report_id
        LEFT JOIN report r ON r.id = f.report_id
        JOIN tenant t ON t.id = COALESCE(p.tenant_id, r.tenant_id)
        ORDER BY f.created_at DESC LIMIT 200`),
    );
    return reply.send({ reports: rows });
  });
}

/** A public report, or one of the citizen's own (RLS limits `report` to their own rows). */
async function followableReportId(tx: Parameters<Parameters<typeof withCitizenSession>[2]>[0], publicId: string): Promise<string | null> {
  const [row] = await tx.execute<{ id: string }>(sql`
    SELECT id FROM public_report WHERE public_id = ${publicId}
    UNION SELECT id FROM report WHERE public_id = ${publicId}
    LIMIT 1`);
  return row?.id ?? null;
}
