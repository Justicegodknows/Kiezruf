// Browsing without an account (US-01, US-15) and "not live here yet" (US-44).
// Everything here reads through the citizen role: the tenant tree and the public views, which carry no score,
// no level, no capture location or time and no author (US-24, US-31).
import { CATEGORY_KEYS, REPORT_ID_PATTERN } from '@kiezruf/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../deps.js';
import { routeTenant } from '../db/routing.js';
import { demandSignal, reportStatus } from '../db/schema.js';
import { withCitizenAccess } from '../db/scope.js';
import { parseOr400, sendError } from '../http.js';

const PUBLIC_STATUSES = reportStatus.enumValues.filter((s) => !['processing', 'in_moderation', 'rejected'].includes(s));

const PointQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

const NearbyQuery = PointQuery.extend({
  radiusM: z.coerce.number().int().min(50).max(10_000).default(2_000),
  category: z.string().refine((key) => CATEGORY_KEYS.includes(key)).optional(),
  status: z.enum(PUBLIC_STATUSES as [string, ...string[]]).optional(),
  maxAgeDays: z.coerce.number().int().min(1).max(365).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

const PublicIdParams = z.object({ publicId: z.string().regex(REPORT_ID_PATTERN) });

/** The fields a citizen may see. Score and level are not among them and must never be (US-24). */
const PUBLIC_FIELDS = sql.raw(`
  p.public_id AS "publicId", p.category, p.status, p.description, p.dangerous,
  ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lon,
  p.created_at AS "createdAt", p.updated_at AS "updatedAt", p.me_too_count AS "meTooCount",
  t.name AS "tenantName", t.office`);

export function publicRoutes(app: FastifyInstance, deps: AppDeps) {
  // Which office receives a report from here (US-41), or "not live here yet" (US-44). Shown on the map,
  // the camera and the compose screen before anything is posted. Records nothing.
  app.get('/public/route', async (request, reply) => {
    const q = parseOr400(PointQuery, request.query, reply);
    if (!q) return reply;
    const result = await withCitizenAccess(deps.db, (tx) => routeTenant(tx, q));
    const tenant = result.tenant && { name: result.tenant.name, office: result.tenant.office, status: result.tenant.status };
    return reply.send({ live: result.live, tenant });
  });

  // The report flow's location check (camera, web posting). Same answer as /public/route, but a not-live answer
  // also counts as an attempted report, so onboarding sees the demand (US-44). Anonymous: the camera opens before
  // sign-in. Stores only the area, never the point or the person.
  app.post('/public/report-attempts', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (request, reply) => {
    const body = parseOr400(PointQuery, request.body, reply);
    if (!body) return reply;
    const result = await withCitizenAccess(deps.db, async (tx) => {
      const routed = await routeTenant(tx, body);
      if (!routed.live) await tx.insert(demandSignal).values({ tenantId: routed.tenant?.id ?? null });
      return routed;
    });
    const tenant = result.tenant && { name: result.tenant.name, office: result.tenant.office, status: result.tenant.status };
    return reply.send({ live: result.live, tenant });
  });

  // Map and list, nearest first (US-15).
  app.get('/public/reports', async (request, reply) => {
    const q = parseOr400(NearbyQuery, request.query, reply);
    if (!q) return reply;
    const here = sql`ST_SetSRID(ST_MakePoint(${q.lon}, ${q.lat}), 4326)::geography`;
    const rows = await withCitizenAccess(deps.db, (tx) =>
      tx.execute(sql`
        SELECT ${PUBLIC_FIELDS}, round(ST_Distance(p.location, ${here}))::integer AS "distanceM"
        FROM public_report p JOIN tenant t ON t.id = p.tenant_id
        WHERE ST_DWithin(p.location, ${here}, ${q.radiusM})
          ${q.category ? sql`AND p.category = ${q.category}` : sql``}
          ${q.status ? sql`AND p.status = ${q.status}::report_status` : sql``}
          ${q.maxAgeDays ? sql`AND p.created_at > now() - make_interval(days => ${q.maxAgeDays})` : sql``}
        ORDER BY "distanceM", p.created_at DESC
        LIMIT ${q.limit}`),
    );
    return reply.send({ reports: rows });
  });

  app.get('/public/reports/:publicId', async (request, reply) => {
    const params = parseOr400(PublicIdParams, request.params, reply);
    if (!params) return reply;
    const found = await withCitizenAccess(deps.db, async (tx) => {
      const [row] = await tx.execute<Record<string, unknown> & { id?: string }>(sql`
        SELECT p.id, ${PUBLIC_FIELDS} FROM public_report p JOIN tenant t ON t.id = p.tenant_id
        WHERE p.public_id = ${params.publicId}`);
      if (!row) return null;
      const photos = await tx.execute<{ public_key: string }>(sql`SELECT public_key FROM public_photo WHERE report_id = ${row.id}`);
      const { id: _id, ...fields } = row;
      return { ...fields, photos: photos.map((p) => ({ url: `${deps.publicPhotoBaseUrl}/${p.public_key}` })) };
    });
    if (!found) return sendError(reply, 404, 'not_found');
    return reply.send(found);
  });
}
