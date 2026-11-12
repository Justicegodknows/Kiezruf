// Helpers shared by the Gherkin steps.
import assert from 'node:assert/strict';
import { parseReportId } from '@kiezruf/shared';
import { sql } from 'drizzle-orm';
import { accessToken } from '../../test/support/tokens.js';
import { signIn, uploadPhotos } from '../../test/support/app.js';
import { SCENARIO_NOW, type KiezrufWorld } from './world.js';

let counter = 0;
export const uniqueEmail = (prefix: string) => `${prefix}-${++counter}@example.org`;

/** Tenant path by display name. "Berlin" is both the Land and the city: `shallowest` picks the Land. */
export async function tenantPath(world: KiezrufWorld, name: string, pick: 'deepest' | 'shallowest' = 'deepest'): Promise<string> {
  const [row] = await world.db.execute<{ path: string }>(sql`
    SELECT path::text AS path FROM tenant WHERE name = ${name}
    ORDER BY CASE WHEN ${pick} = 'deepest' THEN -nlevel(path) ELSE nlevel(path) END LIMIT 1`);
  assert.ok(row, `No tenant named "${name}"`);
  return row.path;
}

/** A new staff account with one role, signed in through email code and TOTP. Returns the staff session token. */
export async function signInNewStaff(world: KiezrufWorld, path: string, role: string): Promise<string> {
  const email = uniqueEmail('feature-staff');
  await world.db.execute(sql`
    WITH a AS (INSERT INTO account (email) VALUES (${email}) RETURNING id)
    INSERT INTO staff_role (account_id, tenant_id, role) SELECT a.id, t.id, ${role}::staff_role_kind FROM a, tenant t WHERE t.path = ${path}::ltree`);
  // A Supabase session after the email code and the authenticator (aal2), as staff get it (ENG-22).
  return accessToken({ email, mfa: true });
}

export async function citizenToken(world: KiezrufWorld): Promise<string> {
  world.citizen ??= await signIn(world.t, uniqueEmail('feature-citizen'));
  return world.citizen;
}

/**
 * The report with this public ID, posted by a citizen in the tenant the ID names and made public. Reuses it when an
 * earlier scenario already created it (the features share one database).
 */
export async function reportWithId(world: KiezrufWorld, publicId: string): Promise<string> {
  const [existing] = await world.db.execute<{ id: string }>(sql`SELECT id FROM report WHERE public_id = ${publicId}`);
  if (existing) return existing.id;
  const parts = parseReportId(publicId);
  assert.ok(parts, `Not a report ID: ${publicId}`);
  const [t] = await world.db.execute<{ id: string; lat: number; lon: number }>(sql`
    SELECT id, ST_Y(ST_PointOnSurface(boundary)) AS lat, ST_X(ST_PointOnSurface(boundary)) AS lon
    FROM tenant WHERE code = ${parts.tenant} AND type = 'bezirk'`);
  assert.ok(t, `No Bezirk with code ${parts.tenant}`);
  await world.db.execute(sql`
    INSERT INTO report_sequence (tenant_id, year, last_value) VALUES (${t.id}, ${parts.year}, ${parts.sequence - 1})
    ON CONFLICT (tenant_id, year) DO UPDATE SET last_value = EXCLUDED.last_value`);
  const token = await citizenToken(world);
  const res = await world.t.app.inject({
    method: 'POST',
    url: '/reports',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      category: 'road_sign',
      capture: { lat: t.lat, lon: t.lon, accuracyM: 10, capturedAt: SCENARIO_NOW.toISOString() },
      photoKeys: await uploadPhotos(world.t, token),
    },
  });
  assert.equal(res.json().publicId, publicId, res.body);
  const [row] = await world.db.execute<{ id: string }>(sql`UPDATE report SET status = 'open' WHERE public_id = ${publicId} RETURNING id`);
  return row!.id;
}

/** "Forwarded" → forwarded, "In progress" → in_progress. */
export const statusValue = (label: string) => label.toLowerCase().replace(/ /g, '_');
