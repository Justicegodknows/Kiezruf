// The console's report work (US-17, US-22 to US-28, US-45). Everything runs through withStaffScope: a report outside
// the caller's subtree is simply not there (404), and row-level security decides what may change.
import { createHash, randomBytes } from 'node:crypto';
import { CATEGORY_KEYS, DEFAULT_THRESHOLDS, FORWARD_LINK_DAYS, LEVELS, REPORT_ID_PATTERN } from '@kiezruf/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { staffOf } from '../auth/plugin.js';
import type { AppDeps } from '../deps.js';
import type { Tx } from '../db/client.js';
import { withStaffScope } from '../db/scope.js';
import { parseOr400, sendError } from '../http.js';
import { statusLabel } from '../mail/messages.js';
import { dbErrorCode, STATUS_FOR } from './errors.js';

const PublicIdParams = z.object({ publicId: z.string().regex(REPORT_ID_PATTERN) });
const ACTIVE_STATUSES = ['processing', 'in_moderation', 'open', 'acknowledged', 'in_progress', 'forwarded'];
const STAFF_STATUSES = ['open', 'acknowledged', 'in_progress', 'resolved', 'rejected'] as const;
/** Staff do not change a report while it waits for blur or moderation, or after it was merged. */
const LOCKED_STATUSES = ['processing', 'in_moderation', 'merged'];

const QueueQuery = z.object({
  status: z.enum([...STAFF_STATUSES, 'forwarded', 'processing', 'in_moderation', 'active', 'all']).default('active'),
  level: z.enum(LEVELS as [string, ...string[]]).optional(),
  category: z.string().refine((key) => CATEGORY_KEYS.includes(key)).optional(),
  tenantId: z.uuid().optional(),
  maxAgeDays: z.coerce.number().int().min(1).max(3650).optional(),
  sort: z.enum(['score', 'age']).default('score'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const Note = z.string().trim().min(1).max(1000);
const StatusBody = z.object({ status: z.enum(STAFF_STATUSES), publicNote: Note.optional(), reason: z.string().trim().min(1).max(500).optional() });
const OverrideBody = z.object({ level: z.enum(LEVELS as [string, ...string[]]).nullable(), reason: z.string().trim().min(1).max(500).optional() });
const ForwardBody = z.union([
  z.object({ tenantId: z.uuid(), publicNote: Note }),
  z.object({ contactId: z.uuid(), publicNote: Note }),
]);
const MergeBody = z.object({ into: z.string().regex(REPORT_ID_PATTERN) });
const SpikeBody = z.object({ action: z.enum(['confirm', 'clear']), reason: z.string().trim().min(1).max(500) });

/** The fields every queue row and detail share. `editable` is true when the caller may change the report. */
const ROW_FIELDS = sql.raw(`
  r.id, r.public_id AS "publicId", r.category, r.status, r.description, r.dangerous, r.public_note AS "publicNote",
  r.created_at AS "createdAt", r.updated_at AS "updatedAt",
  jsonb_build_object('id', t.id, 'name', t.name, 'path', t.path::text, 'type', t.type) AS tenant,
  COALESCE(s.score, 0) AS score, COALESCE(s.effective_level, 'Low') AS level, s.level_changed_at AS "levelChangedAt",
  CASE WHEN s.override_level IS NULL THEN NULL ELSE jsonb_build_object('level', s.override_level, 'reason', s.override_reason) END AS override,
  COALESCE(s.spike_state, 'none') AS "spikeState", COALESCE(s.spike_state IN ('flagged', 'confirmed'), false) AS spike,
  (SELECT count(*)::int FROM reaction x WHERE x.report_id = r.id AND x.kind = 'me_too') AS "meTooCount",
  (SELECT count(*)::int FROM reaction x WHERE x.report_id = r.id AND x.kind = 'co_reporter') AS "coReporterCount",
  (SELECT count(*)::int FROM comment c WHERE c.report_id = r.id AND c.state = 'visible') AS "commentCount",
  r.tenant_path = ANY (app_write_paths()) AS editable,
  ft.name AS "forwardedFrom"`);
const ROW_FROM = sql.raw(`
  report r JOIN tenant t ON t.id = r.tenant_id
  LEFT JOIN report_score s ON s.report_id = r.id
  LEFT JOIN tenant ft ON ft.id = r.forwarded_from_tenant_id`);

type Row = { id: string; publicId: string; status: string; editable: boolean; [k: string]: unknown };

async function findReport(tx: Tx, publicId: string): Promise<Row | undefined> {
  const [row] = await tx.execute<Row>(sql`SELECT ${ROW_FIELDS} FROM ${ROW_FROM} WHERE r.public_id = ${publicId}`);
  return row;
}

/** Runs `fn` on a report the caller may change. Answers 404 outside the scope and 403 read_only for read-only ones. */
async function onEditable<T>(
  deps: AppDeps,
  request: Parameters<typeof staffOf>[0],
  reply: FastifyReply,
  publicId: string,
  fn: (tx: Tx, report: Row) => Promise<T>,
): Promise<T | FastifyReply> {
  try {
    const result = await withStaffScope(deps.db, staffOf(request).scope, async (tx) => {
      const report = await findReport(tx, publicId);
      if (!report) return { error: 'not_found' as const };
      if (!report.editable) return { error: 'read_only' as const };
      return { value: await fn(tx, report) };
    });
    if (result.error) return sendError(reply, result.error === 'not_found' ? 404 : 403, result.error);
    return result.value as T;
  } catch (error) {
    const code = dbErrorCode(error);
    if (code) return sendError(reply, STATUS_FOR[code], code);
    throw error;
  }
}

function audit(tx: Tx, e: { kind: string; reportId: string; from?: string | null; to?: string | null; publicNote?: string | null; reason?: string | null }) {
  return tx.execute(sql`
    INSERT INTO audit_event (kind, report_id, tenant_id, actor_id, from_value, to_value, public_note, reason)
    SELECT ${e.kind}::audit_kind, r.id, r.tenant_id, app_account_id(), ${e.from ?? null}, ${e.to ?? null}, ${e.publicNote ?? null}, ${e.reason ?? null}
    FROM report r WHERE r.id = ${e.reportId}`);
}

export function staffReportRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: app.requireStaff };

  // Priority queue (US-25): by score, with filters. Roll-up nodes see every tenant below them (US-43).
  app.get('/staff/reports', guard, async (request, reply) => {
    const q = parseOr400(QueueQuery, request.query, reply);
    if (!q) return reply;
    const where = sql.join(
      [
        sql`r.merged_into_id IS NULL`,
        q.status === 'active' ? sql`r.status IN ${sql.raw(`('${ACTIVE_STATUSES.join("','")}')`)}` : q.status === 'all' ? sql`true` : sql`r.status = ${q.status}::report_status`,
        q.level ? sql`COALESCE(s.effective_level, 'Low') = ${q.level}` : sql`true`,
        q.category ? sql`r.category = ${q.category}` : sql`true`,
        q.tenantId ? sql`r.tenant_id = ${q.tenantId}` : sql`true`,
        q.maxAgeDays ? sql`r.created_at > now() - make_interval(days => ${q.maxAgeDays})` : sql`true`,
      ],
      sql` AND `,
    );
    const order = q.sort === 'age' ? sql`r.created_at DESC` : sql`COALESCE(s.score, 0) DESC, r.created_at DESC`;
    const { rows, total } = await withStaffScope(deps.db, staffOf(request).scope, async (tx) => {
      const rows = await tx.execute<Row>(sql`SELECT ${ROW_FIELDS} FROM ${ROW_FROM} WHERE ${where} ORDER BY ${order} LIMIT ${q.limit} OFFSET ${q.offset}`);
      const [count] = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${ROW_FROM} WHERE ${where}`);
      return { rows, total: count!.n };
    });
    return reply.send({ reports: rows.map(({ id: _id, ...row }) => row), total });
  });

  // Detail with the score breakdown (US-22: "Breakdown visible to staff").
  app.get('/staff/reports/:publicId', guard, async (request, reply) => {
    const params = parseOr400(PublicIdParams, request.params, reply);
    if (!params) return reply;
    const detail = await withStaffScope(deps.db, staffOf(request).scope, async (tx) => {
      const report = await findReport(tx, params.publicId);
      if (!report) return null;
      const [extra] = await tx.execute<Record<string, unknown>>(sql`
        SELECT ST_Y(r.location::geometry) AS lat, ST_X(r.location::geometry) AS lon,
               jsonb_build_object('lat', ST_Y(r.capture_location::geometry), 'lon', ST_X(r.capture_location::geometry),
                                  'accuracyM', r.capture_accuracy_m, 'at', r.capture_at) AS capture,
               s.breakdown, s.computed_at AS "scoreComputedAt",
               jsonb_build_object('critical', COALESCE(ts.critical, ${DEFAULT_THRESHOLDS.Critical}), 'high', COALESCE(ts.high, ${DEFAULT_THRESHOLDS.High}),
                                  'medium', COALESCE(ts.medium, ${DEFAULT_THRESHOLDS.Medium})) AS thresholds,
               m.public_id AS "mergedInto"
        FROM report r LEFT JOIN report_score s ON s.report_id = r.id LEFT JOIN tenant_settings ts ON ts.tenant_id = r.tenant_id
        LEFT JOIN report m ON m.id = r.merged_into_id
        WHERE r.id = ${report.id}`);
      const photos = await tx.execute<{ original_key: string; public_key: string | null; blur_status: string }>(sql`
        SELECT original_key, public_key, blur_status FROM photo WHERE report_id = ${report.id} ORDER BY created_at`);
      const comments = await tx.execute(sql`
        SELECT c.id, c.body, c.state, c.created_at AS "createdAt", c.account_id AS "accountId",
               (SELECT count(*)::int FROM comment_flag f WHERE f.comment_id = c.id) AS flags
        FROM comment c WHERE c.report_id = ${report.id} ORDER BY c.created_at`);
      const history = await tx.execute(sql`
        SELECT kind, from_value AS "from", to_value AS "to", public_note AS "publicNote", reason, created_at AS "at"
        FROM audit_event WHERE report_id = ${report.id} ORDER BY created_at`);
      // Where it can be forwarded: the parent and live sibling tenants, and the contacts saved on the way up (US-45).
      const tenants = await tx.execute(sql`
        SELECT t.id, t.name, t.type FROM tenant t, report r
        WHERE r.id = ${report.id} AND t.id <> r.tenant_id AND t.status IN ('pilot', 'live')
          AND (t.path = subpath(r.tenant_path, 0, nlevel(r.tenant_path) - 1)
               OR (nlevel(t.path) = nlevel(r.tenant_path) AND t.path <@ subpath(r.tenant_path, 0, nlevel(r.tenant_path) - 1)))
        ORDER BY nlevel(t.path), t.name`);
      const contacts = await tx.execute(sql`
        SELECT c.id, c.name FROM external_contact c JOIN tenant t ON t.id = c.tenant_id, report r
        WHERE r.id = ${report.id} AND t.path @> r.tenant_path ORDER BY c.name`);
      const { id: _id, ...fields } = report;
      return {
        ...fields,
        ...extra,
        photos: await Promise.all(
          photos.map(async (p) => ({
            url: p.public_key ? `${deps.publicPhotoBaseUrl}/${p.public_key}` : null,
            originalUrl: await deps.storage.presignDownload(p.original_key),
            blurStatus: p.blur_status,
          })),
        ),
        comments,
        history,
        forwardTargets: { tenants, contacts },
      };
    });
    if (!detail) return sendError(reply, 404, 'not_found');
    return reply.send(detail);
  });

  // Status and public note (US-28). Followers hear about it through the notification trigger (US-20).
  app.patch('/staff/reports/:publicId/status', guard, async (request, reply) => {
    const params = parseOr400(PublicIdParams, request.params, reply);
    const body = params && parseOr400(StatusBody, request.body, reply);
    if (!params || !body) return reply;
    if (body.status === 'rejected' && !body.reason) return sendError(reply, 422, 'reason_required');
    const result = await onEditable(deps, request, reply, params.publicId, async (tx, report) => {
      if (LOCKED_STATUSES.includes(report.status) || report.status === body.status) return 'invalid_transition' as const;
      await tx.execute(sql`
        UPDATE report SET status = ${body.status}::report_status, updated_at = now()
          ${body.publicNote ? sql`, public_note = ${body.publicNote}` : sql``}
        WHERE id = ${report.id}`);
      await audit(tx, { kind: 'status', reportId: report.id, from: report.status, to: body.status, publicNote: body.publicNote, reason: body.reason });
      return findReport(tx, params.publicId);
    });
    if (result === 'invalid_transition') return sendError(reply, 422, 'invalid_transition');
    if (isReply(result, reply)) return reply;
    const { id: _id, ...row } = result as Row;
    return reply.send(row);
  });

  // Manual level with a required reason; null clears it (US-27). The worker stamps the level change (US-23).
  app.put('/staff/reports/:publicId/override', guard, async (request, reply) => {
    const params = parseOr400(PublicIdParams, request.params, reply);
    const body = params && parseOr400(OverrideBody, request.body, reply);
    if (!params || !body) return reply;
    if (body.level && !body.reason) return sendError(reply, 422, 'reason_required');
    const result = await onEditable(deps, request, reply, params.publicId, async (tx, report) => {
      const [s] = await tx.execute<{ level: string; override_level: string | null }>(sql`
        SELECT level, override_level FROM report_score WHERE report_id = ${report.id}`);
      await tx.execute(sql`
        UPDATE report_score SET override_level = ${body.level}, override_reason = ${body.level ? body.reason! : null},
          override_by = ${body.level ? sql`app_account_id()` : null}, override_at = ${body.level ? sql`now()` : null}, dirty = true
        WHERE report_id = ${report.id}`);
      await audit(tx, { kind: 'override', reportId: report.id, from: s?.override_level ?? null, to: body.level, reason: body.reason });
      return { level: body.level ?? s?.level ?? 'Low', override: body.level ? { level: body.level, reason: body.reason } : null };
    });
    if (isReply(result, reply)) return reply;
    return reply.send(result);
  });

  // Forward to the parent or a sibling tenant, or by email to a saved contact (US-45, D-10).
  app.post('/staff/reports/:publicId/forward', guard, async (request, reply) => {
    const params = parseOr400(PublicIdParams, request.params, reply);
    const body = params && parseOr400(ForwardBody, request.body, reply);
    if (!params || !body) return reply;
    const result = await onEditable(deps, request, reply, params.publicId, async (tx, report) => {
      if (LOCKED_STATUSES.includes(report.status) || ['resolved', 'rejected'].includes(report.status)) return { error: 'invalid_transition' as const };
      if ('tenantId' in body) {
        await tx.execute(sql`SELECT forward_report_to_tenant(${report.id}, ${body.tenantId}, ${body.publicNote})`);
        return { mail: null };
      }
      const [contact] = await tx.execute<{ id: string; name: string; email: string }>(sql`
        SELECT c.id, c.name, c.email FROM external_contact c JOIN tenant t ON t.id = c.tenant_id, report r
        WHERE c.id = ${body.contactId} AND r.id = ${report.id} AND t.path @> r.tenant_path`);
      if (!contact) return { error: 'invalid_target' as const };
      const token = randomBytes(32).toString('base64url');
      await tx.execute(sql`
        INSERT INTO forward (report_id, contact_id, token_hash, expires_at, public_note, actor_id)
        VALUES (${report.id}, ${contact.id}, ${createHash('sha256').update(token).digest('hex')},
                now() + make_interval(days => ${FORWARD_LINK_DAYS}), ${body.publicNote}, app_account_id())`);
      await tx.execute(sql`
        UPDATE report SET status = 'forwarded', public_note = ${body.publicNote}, updated_at = now() WHERE id = ${report.id}`);
      await audit(tx, { kind: 'forward', reportId: report.id, from: report.status, to: contact.name, publicNote: body.publicNote });
      const [where] = await tx.execute<{ lat: number; lon: number; tenant: string; office: string | null }>(sql`
        SELECT ST_Y(r.location::geometry) AS lat, ST_X(r.location::geometry) AS lon, t.name AS tenant, t.office
        FROM report r JOIN tenant t ON t.id = r.tenant_id WHERE r.id = ${report.id}`);
      const photos = await tx.execute<{ public_key: string }>(sql`
        SELECT public_key FROM photo WHERE report_id = ${report.id} AND blur_status = 'done' AND public_key IS NOT NULL`);
      return { mail: { contact, token, where: where!, photos: photos.map((p) => `${deps.publicPhotoBaseUrl}/${p.public_key}`), report } };
    });
    if (isReply(result, reply)) return reply;
    const r = result as { error?: 'invalid_transition' | 'invalid_target'; mail: null | ForwardMail };
    if (r.error) return sendError(reply, 422, r.error);
    if (r.mail) await deps.mailer.send(forwardMail(deps, r.mail, body.publicNote));
    return reply.send({ status: 'forwarded' });
  });

  // Merge a duplicate into another report of the same tenant (US-17).
  app.post('/staff/reports/:publicId/merge', guard, async (request, reply) => {
    const params = parseOr400(PublicIdParams, request.params, reply);
    const body = params && parseOr400(MergeBody, request.body, reply);
    if (!params || !body) return reply;
    const result = await onEditable(deps, request, reply, params.publicId, async (tx, report) => {
      const target = await findReport(tx, body.into);
      if (!target) return 'not_found' as const;
      await tx.execute(sql`SELECT merge_report(${report.id}, ${target.id})`);
      return { mergedInto: body.into };
    });
    if (result === 'not_found') return sendError(reply, 404, 'not_found');
    if (isReply(result, reply)) return reply;
    return reply.send(result);
  });

  // Keep or lift the half weight of new accounts' votes on a flagged report (US-26, US-37).
  app.post('/staff/reports/:publicId/spike', guard, async (request, reply) => {
    const params = parseOr400(PublicIdParams, request.params, reply);
    const body = params && parseOr400(SpikeBody, request.body, reply);
    if (!params || !body) return reply;
    const state = body.action === 'confirm' ? 'confirmed' : 'cleared';
    const result = await onEditable(deps, request, reply, params.publicId, async (tx, report) => {
      const [s] = await tx.execute<{ spike_state: string }>(sql`SELECT spike_state FROM report_score WHERE report_id = ${report.id}`);
      if (!s || s.spike_state === 'none') return 'invalid_transition' as const;
      await tx.execute(sql`
        UPDATE report_score SET spike_state = ${state}::spike_state, spike_reason = ${body.reason}, dirty = true WHERE report_id = ${report.id}`);
      await audit(tx, { kind: 'spike', reportId: report.id, from: s.spike_state, to: state, reason: body.reason });
      return { spikeState: state };
    });
    if (result === 'invalid_transition') return sendError(reply, 422, 'invalid_transition');
    if (isReply(result, reply)) return reply;
    return reply.send(result);
  });
}

function isReply(value: unknown, reply: FastifyReply): boolean {
  return value === reply;
}

interface ForwardMail {
  contact: { name: string; email: string };
  token: string;
  where: { lat: number; lon: number; tenant: string; office: string | null };
  photos: string[];
  report: Row;
}

/** German: the recipients are Berlin authorities. Blurred photos and location only, plus the login-free link. */
function forwardMail(deps: AppDeps, m: ForwardMail, note: string) {
  const link = `${deps.webBaseUrl}/forwarded/${m.token}`;
  const sender = m.where.office ?? m.where.tenant;
  return {
    to: m.contact.email,
    subject: `Weitergeleitete Meldung ${m.report.publicId} von ${sender}`,
    text: [
      `Guten Tag,`,
      ``,
      `${sender} leitet Ihnen über Kiezruf die Meldung ${m.report.publicId} weiter.`,
      ``,
      `Hinweis: ${note}`,
      `Kategorie: ${m.report.category}`,
      `Status: ${statusLabel('de', 'forwarded')}`,
      `Ort: ${m.where.lat.toFixed(6)}, ${m.where.lon.toFixed(6)}`,
      ...(m.report.description ? [`Beschreibung: ${m.report.description}`] : []),
      ...(m.photos.length ? ['', 'Fotos (Gesichter und Kennzeichen unkenntlich gemacht):', ...m.photos] : []),
      ``,
      `Die Meldung ohne Anmeldung ansehen (${FORWARD_LINK_DAYS} Tage gültig):`,
      link,
    ].join('\n'),
  };
}
