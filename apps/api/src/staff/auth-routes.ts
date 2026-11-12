import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { withStaffScope } from '../db/scope.js';
import type { AppDeps } from '../deps.js';
import { endSession } from '../auth/service.js';
import { staffOf } from '../auth/plugin.js';
import { parseOr400, sendError } from '../http.js';
import { staffGrants, staffVerifyEmail, staffVerifyTotp } from './auth.js';

const VerifyBody = z.object({ email: z.email().max(254), code: z.string().regex(/^\d{6}$/) });
const TotpBody = z.object({ challenge: z.uuid(), totp: z.string().regex(/^\d{6}$/) });

export function staffAuthRoutes(app: FastifyInstance, deps: AppDeps) {
  app.post('/staff/auth/verify', { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const body = parseOr400(VerifyBody, request.body, reply);
    if (!body) return reply;
    const result = await staffVerifyEmail(deps.db, deps.authSecret, body.email, body.code);
    if (!result.ok) return sendError(reply, result.status, result.error);
    const { ok: _ok, ...rest } = result;
    return reply.send(rest);
  });

  app.post('/staff/auth/totp', { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const body = parseOr400(TotpBody, request.body, reply);
    if (!body) return reply;
    const result = await staffVerifyTotp(deps.db, deps.authSecret, body.challenge, body.totp, deps.clock?.() ?? new Date());
    if (!result.ok) return sendError(reply, 400, result.error);
    return reply.send({ token: result.token, expiresAt: result.expiresAt.toISOString() });
  });

  app.post('/staff/auth/logout', { preHandler: app.requireStaff }, async (request, reply) => {
    await endSession(deps.db, request.session!.token);
    return reply.code(204).send();
  });

  app.get('/staff/me', { preHandler: app.requireStaff }, async (request, reply) => {
    const staff = staffOf(request);
    const [pref] = await withStaffScope(deps.db, staff.scope, (tx) =>
      tx.execute<{ briefing_email: boolean }>(sql`SELECT briefing_email FROM staff_preference WHERE account_id = app_account_id()`),
    );
    return reply.send({ ...(await staffGrants(deps.db, staff.accountId)), preferences: { briefingEmail: pref?.briefing_email ?? true } });
  });
}
