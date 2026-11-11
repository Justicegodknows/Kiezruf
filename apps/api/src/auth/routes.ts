import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../deps.js';
import { account } from '../db/schema.js';
import { withCitizenSession } from '../db/scope.js';
import { parseOr400, sendError } from '../http.js';
import { LOCALES, loginCodeMail } from '../mail/messages.js';
import { accountIdOf } from './plugin.js';
import { CODE_VALID_MINUTES, endSession, requestCode, verifyCode } from './service.js';

const CodeRequest = z.object({ email: z.email().max(254), locale: z.enum(LOCALES).default('de') });
const VerifyRequest = z.object({
  email: z.email().max(254),
  code: z.string().regex(/^\d{6}$/),
  locale: z.enum(LOCALES).default('de'),
});

export function authRoutes(app: FastifyInstance, deps: AppDeps) {
  // Always 202 for a well-formed address, so the answer does not reveal whether an account exists.
  app.post('/auth/code', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const body = parseOr400(CodeRequest, request.body, reply);
    if (!body) return reply;
    const result = await requestCode(deps.db, deps.authSecret, body.email);
    if (!result.ok) return sendError(reply, 429, result.reason);
    await deps.mailer.send({ to: body.email.trim(), ...loginCodeMail(body.locale, result.code, CODE_VALID_MINUTES) });
    return reply.code(202).send({ sent: true });
  });

  app.post('/auth/verify', { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const body = parseOr400(VerifyRequest, request.body, reply);
    if (!body) return reply;
    const result = await verifyCode(deps.db, deps.authSecret, body.email, body.code, body.locale);
    if (!result.ok) return sendError(reply, 400, result.reason);
    return reply.send({ token: result.token, expiresAt: result.expiresAt.toISOString(), newAccount: result.isNewAccount });
  });

  app.post('/auth/logout', { preHandler: app.requireCitizen }, async (request, reply) => {
    await endSession(deps.db, request.session!.token);
    return reply.code(204).send();
  });

  app.get('/me', { preHandler: app.requireCitizen }, async (request, reply) => {
    const [me] = await withCitizenSession(deps.db, accountIdOf(request), (tx) =>
      tx.select({ id: account.id, email: account.email, locale: account.locale, createdAt: account.createdAt }).from(account),
    );
    if (!me) return sendError(reply, 401, 'unauthorized');
    return reply.send(me);
  });
}
