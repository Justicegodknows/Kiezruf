// Photo AI for citizens (US-13, US-14): category suggestion, "Already reported?", and adding a photo to an existing
// report as a co-reporter. AI answers never block posting: on a timeout or error the citizen simply gets no suggestion.
import { categoryGroup, CATEGORIES, checkCapture, MAX_PHOTOS, MAX_VOTE_DISTANCE_M, REPORT_ID_PATTERN } from '@kiezruf/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { accountIdOf } from '../auth/plugin.js';
import type { AppDeps } from '../deps.js';
import { withCitizenSession } from '../db/scope.js';
import { parseOr400, sendError } from '../http.js';
import { forAi, MAX_PHOTO_BYTES, sanitise } from '../photos/image.js';
import { isOwnPhotoKey } from './service.js';

/** Suggestions are pre-selected only from this confidence (US-14: "start at 0.80"). */
export const PRESELECT_CONFIDENCE = 0.8;
const SUGGEST_TIMEOUT_MS = 3_000;

const Latitude = z.number().min(-90).max(90);
const Longitude = z.number().min(-180).max(180);
const SuggestBody = z.object({ key: z.string().max(200) });
const DuplicatesBody = z.object({ lat: Latitude, lon: Longitude, category: z.string().refine((k) => CATEGORIES.some((c) => c.key === k)), photoKey: z.string().max(200).optional() });
const CoReportBody = z.object({
  capture: z.object({ lat: Latitude, lon: Longitude, accuracyM: z.number().nullable(), capturedAt: z.iso.datetime({ offset: true }).nullable() }),
  photoKeys: z.array(z.string().max(200)).min(1).max(MAX_PHOTOS),
});
const PublicIdParams = z.object({ publicId: z.string().regex(REPORT_ID_PATTERN) });

/** The photo AI's view of an uploaded original, within a time budget; null when there is none. */
async function insightFor(deps: AppDeps, key: string, timeoutMs: number) {
  if (!deps.ai) return null;
  const size = await deps.storage.sizeOf(key);
  if (size === null || size > MAX_PHOTO_BYTES) return null;
  try {
    const image = await forAi(await sanitise(await deps.storage.read(key)));
    return await deps.ai.describePhoto(image, { timeoutMs });
  } catch {
    return null;
  }
}

export function assistRoutes(app: FastifyInstance, deps: AppDeps) {
  const perAccount = (max: number) => ({
    rateLimit: { max, timeWindow: '1 hour', keyGenerator: (r: { session: { accountId: string } | null; ip: string }) => r.session?.accountId ?? r.ip },
  });

  app.post('/uploads/suggest', { preHandler: app.requireCitizen, config: perAccount(60) }, async (request, reply) => {
    const body = parseOr400(SuggestBody, request.body, reply);
    if (!body) return reply;
    if (!isOwnPhotoKey(accountIdOf(request), body.key)) return sendError(reply, 422, 'photo_missing');
    const insight = await insightFor(deps, body.key, SUGGEST_TIMEOUT_MS);
    const category = insight?.category ?? null;
    const confidence = category ? (insight?.confidence ?? null) : null;
    return reply.send({ category, confidence, preselect: category !== null && confidence !== null && confidence >= PRESELECT_CONFIDENCE });
  });

  app.post('/reports/duplicates', { preHandler: app.requireCitizen, config: perAccount(60) }, async (request, reply) => {
    const body = parseOr400(DuplicatesBody, request.body, reply);
    if (!body) return reply;
    if (body.photoKey && !isOwnPhotoKey(accountIdOf(request), body.photoKey)) return sendError(reply, 422, 'photo_missing');
    const group = categoryGroup(body.category)!;
    const sameGroup = CATEGORIES.filter((c) => c.group === group).map((c) => c.key);
    // Photo similarity when the AI answers in time; otherwise the nearest reports of the group.
    let embedding: number[] | null = null;
    if (body.photoKey && deps.ai) {
      const insight = await insightFor(deps, body.photoKey, SUGGEST_TIMEOUT_MS);
      if (insight?.caption) embedding = await deps.ai.embed(insight.caption, { timeoutMs: 2_000 }).catch(() => null);
    }
    const rows = await withCitizenSession(deps.db, accountIdOf(request), (tx) =>
      tx.execute<{ public_id: string; category: string; status: string; distance_m: number; me_too_count: number; photo_key: string | null; similarity: number | null }>(sql`
        SELECT * FROM duplicate_candidates(${body.lon}, ${body.lat}, ${`{${sameGroup.join(',')}}`}::text[], ${embedding ? `[${embedding.join(',')}]` : null})`),
    );
    return reply.send({
      matches: rows.map((r) => ({
        publicId: r.public_id,
        category: r.category,
        status: r.status,
        distanceM: r.distance_m,
        meTooCount: r.me_too_count,
        photo: r.photo_key ? `${deps.publicPhotoBaseUrl}/${r.photo_key}` : null,
        similarity: r.similarity,
      })),
    });
  });

  // "Add my photo to this report" (US-13): the same on-site rules as posting, within 150 m of the report.
  app.post('/reports/:publicId/co-report', { preHandler: app.requireCitizen, config: perAccount(20) }, async (request, reply) => {
    const params = parseOr400(PublicIdParams, request.params, reply);
    const body = params && parseOr400(CoReportBody, request.body, reply);
    if (!params || !body) return reply;
    const accountId = accountIdOf(request);
    const capture = { ...body.capture, capturedAt: body.capture.capturedAt ? new Date(body.capture.capturedAt) : null };
    const gate = checkCapture(capture, deps.clock?.() ?? new Date());
    if (!gate.ok) return sendError(reply, 422, gate.reason);
    if (new Set(body.photoKeys).size !== body.photoKeys.length) return sendError(reply, 422, 'duplicate_photo');
    for (const key of body.photoKeys) {
      if (!isOwnPhotoKey(accountId, key) || !(await deps.storage.exists(key))) return sendError(reply, 422, 'photo_missing');
    }
    const result = await withCitizenSession(deps.db, accountId, async (tx) => {
      const [target] = await tx.execute<{ id: string; near: boolean }>(sql`
        SELECT id, ST_DWithin(location, ST_SetSRID(ST_MakePoint(${capture.lon}, ${capture.lat}), 4326)::geography, ${MAX_VOTE_DISTANCE_M}) AS near
        FROM public_report WHERE public_id = ${params.publicId}`);
      if (!target) return 'not_found' as const;
      if (!target.near) return 'not_on_site' as const;
      for (const key of body.photoKeys) {
        await tx.execute(sql`INSERT INTO photo (report_id, original_key) VALUES (${target.id}, ${key})`);
      }
      await tx.execute(sql`INSERT INTO reaction (report_id, account_id, kind) VALUES (${target.id}, app_account_id(), 'co_reporter') ON CONFLICT DO NOTHING`);
      await tx.execute(sql`INSERT INTO follow (report_id, account_id) VALUES (${target.id}, app_account_id()) ON CONFLICT DO NOTHING`);
      return 'ok' as const;
    });
    if (result === 'not_found') return sendError(reply, 404, 'not_found');
    if (result === 'not_on_site') return sendError(reply, 422, 'not_on_site');
    return reply.code(201).send({ publicId: params.publicId });
  });
}

