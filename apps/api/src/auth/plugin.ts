// Reads `Authorization: Bearer <token>` and resolves the session. Routes that act for a citizen add
// `preHandler: app.requireCitizen`. Browsing needs no account (US-01).
// Web sessions will move to httpOnly cookies when the citizen web client is built (engineering plan, Sessions).
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '../db/client.js';
import { sendError } from '../http.js';
import { resolveSession, type SessionAccount } from './service.js';

declare module 'fastify' {
  interface FastifyRequest {
    session: (SessionAccount & { token: string }) | null;
  }
  interface FastifyInstance {
    requireCitizen: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const match = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(header);
  return match ? match[1]! : null;
}

/** Adds request.session and app.requireCitizen to the root instance (not encapsulated, so every route sees them). */
export function registerAuth(app: FastifyInstance, db: Db): void {
  app.decorateRequest('session', null);
  app.decorate('requireCitizen', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = bearerToken(request);
    const found = token ? await resolveSession(db, token) : null;
    if (!found || found.kind !== 'citizen') {
      await sendError(reply, 401, 'unauthorized');
      return;
    }
    request.session = { ...found, token: token! };
  });
}

/** The signed-in citizen's account id. Only call it in handlers behind requireCitizen. */
export function accountIdOf(request: FastifyRequest): string {
  if (!request.session) throw new Error('Route is missing the requireCitizen pre-handler');
  return request.session.accountId;
}
