// Account, devices and notification settings (US-29, US-34, US-35) and go-live alerts (US-44).
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { accountIdOf } from '../auth/plugin.js';
import type { AppDeps } from '../deps.js';
import { routeTenant } from '../db/routing.js';
import { withCitizenSession } from '../db/scope.js';
import { parseOr400, sendError } from '../http.js';
import { LOCALES } from '../mail/messages.js';

// Expo push tokens look like ExponentPushToken[xxxxxxxx].
const PushTokenBody = z.object({
  token: z.string().regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$/),
  platform: z.enum(['ios', 'android']),
});
const RemovePushTokenBody = PushTokenBody.pick({ token: true });
const Channels = z.object({ push: z.boolean().optional(), email: z.boolean().optional() });
const SettingsBody = z.object({ statusChange: Channels.optional(), goLive: Channels.optional() });
const PatchMeBody = z.object({ locale: z.enum(LOCALES) });
const PointBody = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });

type SettingsRow = {
  status_change_push: boolean;
  status_change_email: boolean;
  go_live_push: boolean;
  go_live_email: boolean;
};

const toSettings = (r: SettingsRow | undefined) => ({
  statusChange: { push: r?.status_change_push ?? true, email: r?.status_change_email ?? true },
  goLive: { push: r?.go_live_push ?? true, email: r?.go_live_email ?? true },
});

export function accountRoutes(app: FastifyInstance, deps: AppDeps) {
  app.patch('/me', { preHandler: app.requireCitizen }, async (request, reply) => {
    const body = parseOr400(PatchMeBody, request.body, reply);
    if (!body) return reply;
    const [me] = await withCitizenSession(deps.db, accountIdOf(request), (tx) =>
      tx.execute(sql`
        UPDATE account SET locale = ${body.locale} WHERE id = app_account_id()
        RETURNING id, email, locale, created_at AS "createdAt"`),
    );
    return reply.send(me);
  });

  // Deletes the account at once (US-34). Every session ends, on every device.
  app.delete('/me', { preHandler: app.requireCitizen }, async (request, reply) => {
    await withCitizenSession(deps.db, accountIdOf(request), (tx) => tx.execute(sql`SELECT delete_my_account()`));
    // The sign-in and its email address live in Supabase: delete them too. Our account row is anonymised already, so a
    // failure here is logged and retried by nobody; the token then still verifies but no longer reaches an account.
    try {
      await deps.supabaseAdmin?.deleteUser(request.session!.authUserId);
    } catch (error) {
      request.log.error({ err: error }, 'Supabase user deletion failed');
    }
    return reply.code(204).send();
  });

  app.put('/me/push-token', { preHandler: app.requireCitizen }, async (request, reply) => {
    const body = parseOr400(PushTokenBody, request.body, reply);
    if (!body) return reply;
    await withCitizenSession(deps.db, accountIdOf(request), (tx) =>
      tx.execute(sql`SELECT register_push_token(${body.token}, ${body.platform}::push_platform)`),
    );
    return reply.code(204).send();
  });

  app.delete('/me/push-token', { preHandler: app.requireCitizen }, async (request, reply) => {
    const body = parseOr400(RemovePushTokenBody, request.body, reply);
    if (!body) return reply;
    await withCitizenSession(deps.db, accountIdOf(request), (tx) => tx.execute(sql`DELETE FROM push_token WHERE token = ${body.token}`));
    return reply.code(204).send();
  });

  app.get('/me/notification-settings', { preHandler: app.requireCitizen }, async (request, reply) => {
    const [row] = await withCitizenSession(deps.db, accountIdOf(request), (tx) =>
      tx.execute<SettingsRow>(sql`SELECT * FROM notification_setting WHERE account_id = app_account_id()`),
    );
    return reply.send(toSettings(row));
  });

  app.put('/me/notification-settings', { preHandler: app.requireCitizen }, async (request, reply) => {
    const body = parseOr400(SettingsBody, request.body, reply);
    if (!body) return reply;
    const [row] = await withCitizenSession(deps.db, accountIdOf(request), async (tx) => {
      const [current] = await tx.execute<SettingsRow>(sql`SELECT * FROM notification_setting WHERE account_id = app_account_id()`);
      const next = toSettings(current);
      Object.assign(next.statusChange, body.statusChange);
      Object.assign(next.goLive, body.goLive);
      return tx.execute<SettingsRow>(sql`
        INSERT INTO notification_setting (account_id, status_change_push, status_change_email, go_live_push, go_live_email)
        VALUES (app_account_id(), ${next.statusChange.push}, ${next.statusChange.email}, ${next.goLive.push}, ${next.goLive.email})
        ON CONFLICT (account_id) DO UPDATE SET
          status_change_push = EXCLUDED.status_change_push, status_change_email = EXCLUDED.status_change_email,
          go_live_push = EXCLUDED.go_live_push, go_live_email = EXCLUDED.go_live_email
        RETURNING *`);
    });
    return reply.send(toSettings(row));
  });

  // "Tell me when it starts here" (US-44): the tenant at the point, which must not be taking reports yet.
  app.post('/go-live-alerts', { preHandler: app.requireCitizen }, async (request, reply) => {
    const body = parseOr400(PointBody, request.body, reply);
    if (!body) return reply;
    const result = await withCitizenSession(deps.db, accountIdOf(request), async (tx) => {
      const routed = await routeTenant(tx, body);
      if (!routed.tenant) return { ok: false, error: 'no_tenant' } as const;
      if (routed.live) return { ok: false, error: 'already_live' } as const;
      await tx.execute(sql`
        INSERT INTO go_live_alert (account_id, tenant_id) VALUES (app_account_id(), ${routed.tenant.id}) ON CONFLICT DO NOTHING`);
      return { ok: true, tenant: routed.tenant.name } as const;
    });
    if (!result.ok) return sendError(reply, result.error === 'already_live' ? 409 : 422, result.error);
    return reply.code(201).send({ tenant: result.tenant });
  });
}
