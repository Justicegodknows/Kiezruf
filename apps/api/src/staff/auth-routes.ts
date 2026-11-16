import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { withStaffScope } from '../db/scope.js';
import type { AppDeps } from '../deps.js';
import { staffOf } from '../auth/plugin.js';
import { staffGrants } from './auth.js';

export function staffAuthRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/staff/me', { preHandler: app.requireStaff }, async (request, reply) => {
    const staff = staffOf(request);
    const [pref] = await withStaffScope(deps.db, staff.scope, (tx) =>
      tx.execute<{ briefing_email: boolean }>(sql`SELECT briefing_email FROM staff_preference WHERE account_id = app_account_id()`),
    );
    return reply.send({ ...(await staffGrants(deps.db, staff.accountId)), preferences: { briefingEmail: pref?.briefing_email ?? true } });
  });
}
