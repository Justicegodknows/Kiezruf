// Moderation (US-26, US-33), tenants and roles (US-40, US-42, US-46), and the login-free forward link (US-45).
import { createHash } from 'node:crypto';
import { validThresholds } from '@kiezruf/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { staffOf } from '../auth/plugin.js';
import type { AppDeps } from '../deps.js';
import type { Tx } from '../db/client.js';
import { staffRoleKind, tenantStatus } from '../db/schema.js';
import { withCitizenAccess, withStaffScope } from '../db/scope.js';
import { parseOr400, sendError } from '../http.js';
import { dbErrorCode, STATUS_FOR } from './errors.js';

const IdParams = z.object({ id: z.uuid() });
const ContactParams = z.object({ id: z.uuid(), contactId: z.uuid() });
const StaffParams = z.object({ id: z.uuid(), accountId: z.uuid() });
const Reason = z.string().trim().min(1).max(500);
const CommentBody = z.object({ state: z.enum(['visible', 'removed']), reason: Reason });
const BanBody = z.object({ reason: Reason });
const TenantStatusBody = z.object({ status: z.enum(tenantStatus.enumValues) });
const SettingsBody = z.object({
  thresholds: z.object({ critical: z.number().positive(), high: z.number().positive(), medium: z.number().positive() }).optional(),
  office: z.string().trim().min(1).max(200).optional(),
});
const ContactBody = z.object({ name: z.string().trim().min(1).max(200), email: z.email().max(254) });
const InviteBody = z.object({ email: z.email().max(254), role: z.enum(staffRoleKind.enumValues) });
const TokenParams = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{40,60}$/) });

/** Runs a staff transaction and turns the database functions' error codes into answers. */
async function staffTx<T>(deps: AppDeps, request: Parameters<typeof staffOf>[0], reply: FastifyReply, fn: (tx: Tx) => Promise<T>) {
  try {
    return { ok: true as const, value: await withStaffScope(deps.db, staffOf(request).scope, fn) };
  } catch (error) {
    const code = dbErrorCode(error);
    if (!code) throw error;
    await sendError(reply, STATUS_FOR[code], code);
    return { ok: false as const };
  }
}

export function staffAdminRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: app.requireStaff };

  // --- Moderation -------------------------------------------------------------------------------------
  app.get('/staff/moderation', guard, async (request, reply) => {
    const result = await withStaffScope(deps.db, staffOf(request).scope, async (tx) => ({
      comments: await tx.execute(sql`
        SELECT c.id, c.body, c.state, c.created_at AS "createdAt", c.account_id AS "accountId", r.public_id AS "reportPublicId",
               t.name AS "tenantName", (SELECT count(*)::int FROM comment_flag f WHERE f.comment_id = c.id) AS flags,
               r.tenant_path = ANY (app_write_paths()) AS editable
        FROM comment c JOIN report r ON r.id = c.report_id JOIN tenant t ON t.id = r.tenant_id
        WHERE c.state = 'held' OR (c.state = 'visible' AND EXISTS (SELECT 1 FROM comment_flag f WHERE f.comment_id = c.id))
        ORDER BY c.created_at`),
      spikes: await tx.execute(sql`
        SELECT r.public_id AS "publicId", r.category, t.name AS "tenantName", s.spike_state AS "spikeState", s.score,
               (SELECT count(*)::int FROM reaction x WHERE x.report_id = r.id AND x.kind = 'me_too') AS "meTooCount",
               r.tenant_path = ANY (app_write_paths()) AS editable
        FROM report_score s JOIN report r ON r.id = s.report_id JOIN tenant t ON t.id = r.tenant_id
        WHERE s.spike_state = 'flagged' ORDER BY r.created_at`),
      // Reports whose photos could not be blurred wait here and are never published unblurred (Phase 3 pipeline).
      held: await tx.execute(sql`
        SELECT r.public_id AS "publicId", t.name AS "tenantName", r.created_at AS "createdAt",
               (SELECT p.failure_reason FROM photo p WHERE p.report_id = r.id AND p.failure_reason IS NOT NULL LIMIT 1) AS reason
        FROM report r JOIN tenant t ON t.id = r.tenant_id WHERE r.status = 'in_moderation' ORDER BY r.created_at`),
    }));
    return reply.send(result);
  });

  app.patch('/staff/comments/:id', guard, async (request, reply) => {
    const params = parseOr400(IdParams, request.params, reply);
    const body = params && parseOr400(CommentBody, request.body, reply);
    if (!params || !body) return reply;
    const result = await withStaffScope(deps.db, staffOf(request).scope, async (tx) => {
      const [c] = await tx.execute<{ state: string; report_id: string; editable: boolean }>(sql`
        SELECT c.state, c.report_id, r.tenant_path = ANY (app_write_paths()) AS editable
        FROM comment c JOIN report r ON r.id = c.report_id WHERE c.id = ${params.id}`);
      if (!c) return 'not_found' as const;
      if (!c.editable) return 'read_only' as const;
      await tx.execute(sql`UPDATE comment SET state = ${body.state}::comment_state WHERE id = ${params.id}`);
      await tx.execute(sql`
        INSERT INTO audit_event (kind, report_id, tenant_id, actor_id, from_value, to_value, reason, data)
        SELECT 'comment', r.id, r.tenant_id, app_account_id(), ${c.state}, ${body.state}, ${body.reason}, jsonb_build_object('comment', ${params.id}::text)
        FROM report r WHERE r.id = ${c.report_id}`);
      return 'ok' as const;
    });
    if (result !== 'ok') return sendError(reply, result === 'not_found' ? 404 : 403, result);
    return reply.send({ state: body.state });
  });

  app.post('/staff/accounts/:id/ban', guard, async (request, reply) => {
    const params = parseOr400(IdParams, request.params, reply);
    const body = params && parseOr400(BanBody, request.body, reply);
    if (!params || !body) return reply;
    const result = await staffTx(deps, request, reply, (tx) => tx.execute(sql`SELECT ban_account(${params.id}, ${body.reason})`));
    if (!result.ok) return reply;
    return reply.code(204).send();
  });

  // --- Tenants ----------------------------------------------------------------------------------------
  app.get('/staff/tenants', guard, async (request, reply) => {
    const tenants = await withStaffScope(deps.db, staffOf(request).scope, (tx) =>
      tx.execute(sql`
        SELECT t.id, t.parent_id AS "parentId", t.path::text AS path, t.type, t.name, t.office, t.code, t.status,
               t.boundary IS NOT NULL AS "hasBoundary",
               jsonb_build_object('critical', COALESCE(ts.critical, 60), 'high', COALESCE(ts.high, 25), 'medium', COALESCE(ts.medium, 10)) AS thresholds,
               t.path <@ app_admin_paths() AS "canAdmin", t.path <@ app_platform_paths() AS "canActivate"
        FROM tenant t LEFT JOIN tenant_settings ts ON ts.tenant_id = t.id
        WHERE t.path <@ app_scope_paths() ORDER BY t.path`),
    );
    return reply.send({ tenants });
  });

  app.patch('/staff/tenants/:id', guard, async (request, reply) => {
    const params = parseOr400(IdParams, request.params, reply);
    const body = params && parseOr400(TenantStatusBody, request.body, reply);
    if (!params || !body) return reply;
    try {
      const result = await staffTx(deps, request, reply, (tx) => tx.execute(sql`SELECT set_tenant_status(${params.id}, ${body.status}::tenant_status)`));
      if (!result.ok) return reply;
    } catch (error) {
      // A node needs a boundary and a code before it can take reports (tenant_receiving_complete).
      if (String((error as Error).cause ?? error).includes('tenant_receiving_complete')) return sendError(reply, 422, 'invalid_target');
      throw error;
    }
    return reply.send({ status: body.status });
  });

  app.put('/staff/tenants/:id/settings', guard, async (request, reply) => {
    const params = parseOr400(IdParams, request.params, reply);
    const body = params && parseOr400(SettingsBody, request.body, reply);
    if (!params || !body) return reply;
    const t = body.thresholds;
    if (t && !validThresholds({ Critical: t.critical, High: t.high, Medium: t.medium })) {
      return sendError(reply, 400, 'invalid_request', { fields: ['thresholds'] });
    }
    const result = await staffTx(deps, request, reply, async (tx) => {
      const [node] = await tx.execute<{ admin: boolean }>(sql`SELECT path <@ app_admin_paths() AS admin FROM tenant WHERE id = ${params.id}`);
      if (!node?.admin) throw new Error('forbidden_role');
      if (t) {
        await tx.execute(sql`
          INSERT INTO tenant_settings (tenant_id, critical, high, medium) VALUES (${params.id}, ${t.critical}, ${t.high}, ${t.medium})
          ON CONFLICT (tenant_id) DO UPDATE SET critical = EXCLUDED.critical, high = EXCLUDED.high, medium = EXCLUDED.medium`);
        // New thresholds change levels: recompute this tenant's scores.
        await tx.execute(sql`UPDATE report_score s SET dirty = true FROM report r WHERE r.id = s.report_id AND r.tenant_id = ${params.id}`);
      }
      if (body.office) await tx.execute(sql`SELECT set_tenant_office(${params.id}, ${body.office})`);
      await tx.execute(sql`
        INSERT INTO audit_event (kind, tenant_id, actor_id, data) VALUES ('settings', ${params.id}, app_account_id(), ${JSON.stringify(body)}::jsonb)`);
    });
    if (!result.ok) return reply;
    return reply.code(204).send();
  });

  // --- External contacts (US-45, US-46) -----------------------------------------------------------------
  app.get('/staff/tenants/:id/contacts', guard, async (request, reply) => {
    const params = parseOr400(IdParams, request.params, reply);
    if (!params) return reply;
    const contacts = await withStaffScope(deps.db, staffOf(request).scope, (tx) =>
      tx.execute(sql`SELECT id, name, email, created_at AS "createdAt" FROM external_contact WHERE tenant_id = ${params.id} ORDER BY name`),
    );
    return reply.send({ contacts });
  });

  app.post('/staff/tenants/:id/contacts', guard, async (request, reply) => {
    const params = parseOr400(IdParams, request.params, reply);
    const body = params && parseOr400(ContactBody, request.body, reply);
    if (!params || !body) return reply;
    const result = await staffTx(deps, request, reply, async (tx) => {
      const [node] = await tx.execute<{ admin: boolean }>(sql`SELECT path <@ app_admin_paths() AS admin FROM tenant WHERE id = ${params.id}`);
      if (!node?.admin) throw new Error('forbidden_role');
      const [row] = await tx.execute<{ id: string }>(sql`
        INSERT INTO external_contact (tenant_id, name, email) VALUES (${params.id}, ${body.name}, ${body.email}) RETURNING id`);
      await tx.execute(sql`
        INSERT INTO audit_event (kind, tenant_id, actor_id, to_value) VALUES ('contact', ${params.id}, app_account_id(), ${body.name})`);
      return row!;
    });
    if (!result.ok) return reply;
    return reply.code(201).send({ id: result.value.id, ...body });
  });

  app.delete('/staff/tenants/:id/contacts/:contactId', guard, async (request, reply) => {
    const params = parseOr400(ContactParams, request.params, reply);
    if (!params) return reply;
    const result = await staffTx(deps, request, reply, async (tx) => {
      const deleted = await tx.execute(sql`
        DELETE FROM external_contact WHERE id = ${params.contactId} AND tenant_id = ${params.id} RETURNING name`);
      if (deleted.length === 0) throw new Error('forbidden_role');
      await tx.execute(sql`
        INSERT INTO audit_event (kind, tenant_id, actor_id, from_value) VALUES ('contact', ${params.id}, app_account_id(), ${String(deleted[0]!.name)})`);
    });
    if (!result.ok) return reply;
    return reply.code(204).send();
  });

  // --- Staff and roles (US-42, US-46) -------------------------------------------------------------------
  app.get('/staff/tenants/:id/staff', guard, async (request, reply) => {
    const params = parseOr400(IdParams, request.params, reply);
    if (!params) return reply;
    const staff = await withStaffScope(deps.db, staffOf(request).scope, (tx) =>
      tx.execute(sql`SELECT account_id AS "accountId", email, role, created_at AS "createdAt" FROM staff_at_tenant(${params.id})`),
    );
    return reply.send({ staff });
  });

  app.post('/staff/tenants/:id/staff', guard, async (request, reply) => {
    const params = parseOr400(IdParams, request.params, reply);
    const body = params && parseOr400(InviteBody, request.body, reply);
    if (!params || !body) return reply;
    const result = await staffTx(deps, request, reply, async (tx) => {
      const [row] = await tx.execute<{ id: string }>(sql`SELECT invite_staff(${body.email}, ${params.id}, ${body.role}::staff_role_kind) AS id`);
      const [t] = await tx.execute<{ name: string }>(sql`SELECT name FROM tenant WHERE id = ${params.id}`);
      return { accountId: row!.id, tenant: t!.name };
    });
    if (!result.ok) return reply;
    await deps.mailer.send({
      to: body.email,
      subject: `Ihr Zugang zur Kiezruf-Konsole (${result.value.tenant})`,
      text: `Sie wurden für ${result.value.tenant} zur Kiezruf-Konsole eingeladen.\n\nMelden Sie sich hier mit dieser E-Mail-Adresse an. Beim ersten Mal richten Sie eine Authenticator-App als zweiten Faktor ein:\n${deps.webBaseUrl}/console\n\nYou have been invited to the Kiezruf console for ${result.value.tenant}. Sign in at the link above with this email address.`,
    });
    return reply.code(201).send({ accountId: result.value.accountId, role: body.role });
  });

  app.delete('/staff/tenants/:id/staff/:accountId', guard, async (request, reply) => {
    const params = parseOr400(StaffParams, request.params, reply);
    if (!params) return reply;
    const result = await staffTx(deps, request, reply, (tx) => tx.execute(sql`SELECT revoke_staff(${params.accountId}, ${params.id})`));
    if (!result.ok) return reply;
    return reply.code(204).send();
  });

  // --- Forward link: no login (US-45) -------------------------------------------------------------------
  app.get('/forwarded/:token', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const params = parseOr400(TokenParams, request.params, reply);
    if (!params) return reply;
    const hash = createHash('sha256').update(params.token).digest('hex');
    const [row] = await withCitizenAccess(deps.db, (tx) => tx.execute<{ data: Record<string, unknown> | null }>(sql`SELECT forwarded_report(${hash}) AS data`));
    const data = row?.data;
    if (!data) return sendError(reply, 404, 'not_found');
    if (data.expired) return sendError(reply, 410, 'link_expired');
    const { expired: _expired, photos, ...rest } = data as { expired: boolean; photos: string[] };
    return reply.send({ ...rest, photos: photos.map((key) => ({ url: `${deps.publicPhotoBaseUrl}/${key}` })) });
  });
}
