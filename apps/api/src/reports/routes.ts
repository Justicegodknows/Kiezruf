import { CATEGORY_KEYS, MAX_PHOTOS, REPORT_ID_PATTERN } from '@kiezruf/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { accountIdOf } from '../auth/plugin.js';
import type { AppDeps } from '../deps.js';
import { sql } from 'drizzle-orm';
import { withCitizenSession } from '../db/scope.js';
import { parseOr400, sendError } from '../http.js';
import { addMeToo, newPhotoKey, postReport, removeMeToo, UPLOAD_TYPES, type UploadType } from './service.js';

const Latitude = z.number().min(-90).max(90);
const Longitude = z.number().min(-180).max(180);

const UploadRequest = z.object({ contentType: z.enum(Object.keys(UPLOAD_TYPES) as [UploadType, ...UploadType[]]) });

const PostReportRequest = z.object({
  category: z.string().refine((key) => CATEGORY_KEYS.includes(key)),
  description: z.string().trim().min(1).max(1000).optional(),
  dangerous: z.boolean().default(false),
  capture: z.object({
    lat: Latitude,
    lon: Longitude,
    // null: the photo carried no location or time metadata (desktop uploads, US-04).
    accuracyM: z.number().nullable(),
    capturedAt: z.iso.datetime({ offset: true }).nullable(),
  }),
  pin: z.object({ lat: Latitude, lon: Longitude }).optional(),
  photoKeys: z.array(z.string().max(200)).min(1).max(MAX_PHOTOS),
  // The photo AI's suggestion the citizen saw (US-14), logged as feedback when they chose otherwise.
  suggestion: z.object({ category: z.string().refine((key) => CATEGORY_KEYS.includes(key)), confidence: z.number().min(0).max(1).nullable() }).optional(),
});

const VoteRequest = z.object({ lat: Latitude, lon: Longitude, accuracyM: z.number() });
const PublicIdParams = z.object({ publicId: z.string().regex(REPORT_ID_PATTERN) });

export function reportRoutes(app: FastifyInstance, deps: AppDeps) {
  const perAccount = (max: number, timeWindow: string) => ({
    rateLimit: { max, timeWindow, keyGenerator: (request: { session: { accountId: string } | null; ip: string }) => request.session?.accountId ?? request.ip },
  });

  // Step 1 of posting: a presigned URL for one original photo in the private bucket (US-06, US-16).
  app.post('/uploads', { preHandler: app.requireCitizen, config: perAccount(30, '1 hour') }, async (request, reply) => {
    const body = parseOr400(UploadRequest, request.body, reply);
    if (!body) return reply;
    const key = newPhotoKey(accountIdOf(request), body.contentType);
    const upload = await deps.storage.presignUpload(key, body.contentType);
    return reply.code(201).send({
      key,
      url: upload.url,
      method: 'PUT',
      headers: { 'Content-Type': body.contentType },
      expiresAt: upload.expiresAt.toISOString(),
    });
  });

  // Step 2: the report itself. Accepted reports start as "processing" and become public after blur (US-31).
  app.post('/reports', { preHandler: app.requireCitizen, config: perAccount(20, '1 hour') }, async (request, reply) => {
    const body = parseOr400(PostReportRequest, request.body, reply);
    if (!body) return reply;
    const result = await postReport(deps, accountIdOf(request), {
      ...body,
      capture: { ...body.capture, capturedAt: body.capture.capturedAt ? new Date(body.capture.capturedAt) : null },
    });
    if (!result.ok) {
      const { ok: _ok, status, error, ...details } = result;
      return sendError(reply, status, error, details);
    }
    return reply.code(201).send({ publicId: result.publicId, status: 'processing', tenant: result.tenant });
  });

  // "My reports" (US-11): the citizen's own reports, including ones not public yet.
  app.get('/me/reports', { preHandler: app.requireCitizen }, async (request, reply) => {
    const rows = await withCitizenSession(deps.db, accountIdOf(request), (tx) =>
      tx.execute(sql`
        SELECT r.public_id AS "publicId", r.category, r.status, r.description, r.created_at AS "createdAt",
               t.name AS "tenantName", t.office
        FROM report r JOIN tenant t ON t.id = r.tenant_id
        ORDER BY r.created_at DESC LIMIT 200`),
    );
    return reply.send({ reports: rows });
  });

  app.put('/reports/:publicId/me-too', { preHandler: app.requireCitizen, config: perAccount(120, '1 hour') }, async (request, reply) => {
    const params = parseOr400(PublicIdParams, request.params, reply);
    const body = params && parseOr400(VoteRequest, request.body, reply);
    if (!params || !body) return reply;
    const result = await addMeToo(deps, accountIdOf(request), params.publicId, body);
    if (!result.ok) return sendError(reply, result.status, result.error);
    return reply.send({ voted: result.voted, meTooCount: result.meTooCount });
  });

  app.delete('/reports/:publicId/me-too', { preHandler: app.requireCitizen }, async (request, reply) => {
    const params = parseOr400(PublicIdParams, request.params, reply);
    if (!params) return reply;
    const result = await removeMeToo(deps, accountIdOf(request), params.publicId);
    if (!result.ok) return sendError(reply, result.status, result.error);
    return reply.send({ voted: result.voted, meTooCount: result.meTooCount });
  });
}
