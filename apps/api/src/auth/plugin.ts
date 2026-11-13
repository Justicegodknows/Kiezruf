// Reads `Authorization: Bearer <Supabase access token>` (ENG-22). Routes that act for a citizen add
// `preHandler: app.requireCitizen`; staff routes add `app.requireStaff`, which also needs a fresh second factor.
// Browsing needs no account (US-01).
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '../db/client.js';
import { loadStaffScope, type StaffScope } from '../db/scope.js';
import { sendError } from '../http.js';
import { resolveAccount } from './service.js';
import { hasFreshMfa, type TokenVerifier } from './supabase.js';

declare module 'fastify' {
  interface FastifyRequest {
    session: { accountId: string; authUserId: string; token: string; isNewAccount: boolean } | null;
    staff: { accountId: string; scope: StaffScope } | null;
  }
  interface FastifyInstance {
    requireCitizen: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireStaff: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*)$/.exec(header);
  return match && header.length < 8_000 ? match[1]! : null;
}

/** Adds request.session, app.requireCitizen and app.requireStaff to the root instance. */
export function registerAuth(app: FastifyInstance, db: Db, verifier: TokenVerifier): void {
  app.decorateRequest('session', null);
  app.decorateRequest('staff', null);

  async function authenticate(request: FastifyRequest, reply: FastifyReply, staff: boolean) {
    const token = bearerToken(request);
    const claims = token ? await verifier.verify(token) : null;
    if (!claims) {
      await sendError(reply, 401, 'unauthorized');
      return null;
    }
    // Staff need a TOTP check in this Supabase session from the last 12 hours.
    if (staff && !hasFreshMfa(claims)) {
      await sendError(reply, 401, 'mfa_required');
      return null;
    }
    const account = await resolveAccount(db, claims);
    if (!account.ok) {
      // An address already held by an account this user may not take over (ENG-24): say so, rather than sign out.
      if (account.reason === 'email_taken') await sendError(reply, 409, 'email_taken');
      else await sendError(reply, 401, 'unauthorized');
      return null;
    }
    request.session = { accountId: account.accountId, authUserId: claims.sub, token: token!, isNewAccount: account.isNewAccount };
    return account.accountId;
  }

  app.decorate('requireCitizen', async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply, false);
  });

  // Staff routes: a staff session and at least one role grant (US-42).
  app.decorate('requireStaff', async (request: FastifyRequest, reply: FastifyReply) => {
    const accountId = await authenticate(request, reply, true);
    if (!accountId) return;
    const scope = await loadStaffScope(db, accountId);
    if (scope.readPaths.length === 0) {
      await sendError(reply, 403, 'not_staff');
      return;
    }
    request.staff = { accountId, scope };
  });
}

/** The signed-in staff member and scope. Only call it in handlers behind requireStaff. */
export function staffOf(request: FastifyRequest): { accountId: string; scope: StaffScope } {
  if (!request.staff) throw new Error('Route is missing the requireStaff pre-handler');
  return request.staff;
}

/** The signed-in citizen's account id. Only call it in handlers behind requireCitizen. */
export function accountIdOf(request: FastifyRequest): string {
  if (!request.session) throw new Error('Route is missing the requireCitizen pre-handler');
  return request.session.accountId;
}
