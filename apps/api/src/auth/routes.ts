import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../deps.js';
import { account } from '../db/schema.js';
import { withCitizenSession } from '../db/scope.js';
import { sendError } from '../http.js';
import { accountIdOf } from './plugin.js';

// Sign-in, sign-out and sessions are Supabase Auth (ENG-22). The API only answers who the caller is.
export function authRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/me', { preHandler: app.requireCitizen }, async (request, reply) => {
    const [me] = await withCitizenSession(deps.db, accountIdOf(request), (tx) =>
      tx.select({ id: account.id, email: account.email, locale: account.locale, createdAt: account.createdAt }).from(account),
    );
    if (!me) return sendError(reply, 401, 'unauthorized');
    return reply.send({ ...me, newAccount: request.session!.isNewAccount });
  });
}
