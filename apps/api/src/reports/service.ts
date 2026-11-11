// Posting a report (US-03, US-06, US-08, US-10, US-11, US-41, US-44) and Me too (US-18, D-03, D-05).
import { randomUUID } from 'node:crypto';
import {
  berlinYear,
  categoryNeedsDescription,
  checkCapture,
  formatReportId,
  MAX_ACCURACY_M,
  MAX_PIN_ADJUST_M,
  MAX_VOTE_DISTANCE_M,
} from '@kiezruf/shared';
import { sql } from 'drizzle-orm';
import type { AppDeps } from '../deps.js';
import { routeTenant } from '../db/routing.js';
import { demandSignal, photo, report } from '../db/schema.js';
import { withCitizenSession } from '../db/scope.js';

export interface Point {
  lat: number;
  lon: number;
}

const geography = (p: Point) => sql`ST_SetSRID(ST_MakePoint(${p.lon}, ${p.lat}), 4326)::geography`;

// --- photo uploads ---------------------------------------------------------------------------------

export const UPLOAD_TYPES = { 'image/jpeg': 'jpg', 'image/heic': 'heic', 'image/png': 'png' } as const;
export type UploadType = keyof typeof UPLOAD_TYPES;

/** Object keys carry the uploader's account id, so a report can only use photos its author uploaded. */
export function newPhotoKey(accountId: string, contentType: UploadType): string {
  return `originals/${accountId}/${randomUUID()}.${UPLOAD_TYPES[contentType]}`;
}

export function isOwnPhotoKey(accountId: string, key: string): boolean {
  const prefix = `originals/${accountId}/`;
  return key.startsWith(prefix) && /^[0-9a-f-]{36}\.(jpg|heic|png)$/.test(key.slice(prefix.length));
}

// --- posting ---------------------------------------------------------------------------------------

export interface NewReport {
  category: string;
  description?: string;
  dangerous: boolean;
  capture: Point & { accuracyM: number | null; capturedAt: Date | null };
  /** Where the citizen placed the pin, within 50 m of the capture point (US-10). Defaults to the capture point. */
  pin?: Point;
  photoKeys: string[];
}

export type PostResult =
  | { ok: true; publicId: string; tenant: { name: string; office: string | null } }
  | { ok: false; status: 422; error: 'no_metadata' | 'accuracy_too_low' | 'capture_too_old' | 'capture_in_future' }
  | { ok: false; status: 422; error: 'description_required' | 'pin_too_far' | 'photo_missing' | 'duplicate_photo' }
  | { ok: false; status: 422; error: 'not_live'; tenant: string | null };

export async function postReport(deps: AppDeps, accountId: string, input: NewReport): Promise<PostResult> {
  const now = deps.clock?.() ?? new Date();

  const gate = checkCapture(input.capture, now);
  if (!gate.ok) return { ok: false, status: 422, error: gate.reason };
  if (categoryNeedsDescription(input.category) && !input.description) {
    return { ok: false, status: 422, error: 'description_required' };
  }
  if (new Set(input.photoKeys).size !== input.photoKeys.length) return { ok: false, status: 422, error: 'duplicate_photo' };
  if (!input.photoKeys.every((key) => isOwnPhotoKey(accountId, key))) return { ok: false, status: 422, error: 'photo_missing' };

  // Routing uses the capture point: the on-site rule is about where the citizen stands (US-03, US-41).
  const route = await withCitizenSession(deps.db, accountId, async (tx) => {
    const routed = await routeTenant(tx, input.capture);
    if (!routed.live) await tx.insert(demandSignal).values({ tenantId: routed.tenant?.id ?? null });
    return routed;
  });
  if (!route.live) return { ok: false, status: 422, error: 'not_live', tenant: route.tenant?.name ?? null };

  for (const key of input.photoKeys) {
    if (!(await deps.storage.exists(key))) return { ok: false, status: 422, error: 'photo_missing' };
  }

  const pin = input.pin ?? input.capture;
  return withCitizenSession(deps.db, accountId, async (tx) => {
    const [distance] = await tx.execute<{ m: number }>(sql`SELECT ST_Distance(${geography(input.capture)}, ${geography(pin)}) AS m`);
    if (distance!.m > MAX_PIN_ADJUST_M) return { ok: false, status: 422, error: 'pin_too_far' } as const;

    const tenant = route.tenant;
    const [land] = await tx.execute<{ code: string }>(sql`
      SELECT code FROM tenant WHERE type = 'land' AND path @> ${tenant.path}::ltree LIMIT 1`);
    if (!land?.code || !tenant.code) throw new Error(`Tenant ${tenant.path} has no Land or tenant code`);

    const year = berlinYear(now);
    const [seq] = await tx.execute<{ n: number }>(sql`SELECT next_report_sequence(${tenant.id}, ${year}) AS n`);
    const publicId = formatReportId({ land: land.code, tenant: tenant.code, year, sequence: seq!.n });

    const [created] = await tx
      .insert(report)
      .values({
        publicId,
        tenantId: tenant.id,
        category: input.category,
        description: input.description ?? null,
        dangerous: input.dangerous,
        location: geography(pin),
        captureLocation: geography(input.capture),
        captureAccuracyM: input.capture.accuracyM,
        captureAt: input.capture.capturedAt!,
        createdBy: accountId,
      })
      .returning({ id: report.id });
    await tx.insert(photo).values(input.photoKeys.map((originalKey) => ({ reportId: created!.id, originalKey })));
    return { ok: true, publicId, tenant: { name: tenant.name, office: tenant.office } } as const;
  });
}

// --- Me too ----------------------------------------------------------------------------------------

export type VoteResult =
  | { ok: true; voted: boolean; meTooCount: number }
  | { ok: false; status: 404; error: 'not_found' }
  | { ok: false; status: 422; error: 'accuracy_too_low' | 'not_on_site' };

/** Adds a Me too vote. Voting needs the citizen on-site, like posting (D-03). Voting twice is a no-op. */
export async function addMeToo(deps: AppDeps, accountId: string, publicId: string, at: Point & { accuracyM: number }): Promise<VoteResult> {
  if (!(at.accuracyM >= 0) || at.accuracyM > MAX_ACCURACY_M) return { ok: false, status: 422, error: 'accuracy_too_low' };
  return withCitizenSession(deps.db, accountId, async (tx) => {
    const [target] = await tx.execute<{ id: string; near: boolean }>(sql`
      SELECT id, ST_DWithin(location, ${geography(at)}, ${MAX_VOTE_DISTANCE_M}) AS near
      FROM public_report WHERE public_id = ${publicId}`);
    if (!target) return { ok: false, status: 404, error: 'not_found' } as const;
    if (!target.near) return { ok: false, status: 422, error: 'not_on_site' } as const;
    await tx.execute(sql`
      INSERT INTO reaction (report_id, account_id, kind) VALUES (${target.id}, ${accountId}, 'me_too')
      ON CONFLICT DO NOTHING`);
    return { ok: true, voted: true, meTooCount: await meTooCount(tx, publicId) } as const;
  });
}

/** Takes back a Me too vote (US-18: undoable). Needs no location. */
export async function removeMeToo(deps: AppDeps, accountId: string, publicId: string): Promise<VoteResult> {
  return withCitizenSession(deps.db, accountId, async (tx) => {
    const [target] = await tx.execute<{ id: string }>(sql`SELECT id FROM public_report WHERE public_id = ${publicId}`);
    if (!target) return { ok: false, status: 404, error: 'not_found' } as const;
    await tx.execute(sql`DELETE FROM reaction WHERE report_id = ${target.id} AND account_id = ${accountId} AND kind = 'me_too'`);
    return { ok: true, voted: false, meTooCount: await meTooCount(tx, publicId) } as const;
  });
}

async function meTooCount(tx: Parameters<Parameters<typeof withCitizenSession>[2]>[0], publicId: string): Promise<number> {
  const [row] = await tx.execute<{ n: number }>(sql`SELECT me_too_count AS n FROM public_report WHERE public_id = ${publicId}`);
  return row?.n ?? 0;
}
