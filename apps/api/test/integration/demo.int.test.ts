// The demo data (src/db/seed/demo.ts) against the real migrations and tenant seed: it must look right through the
// citizen and console APIs, and leave no trace after removal.
import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../src/db/client.js';
import { DEMO_DOMAIN, DEMO_REPORTS, DEMO_STAFF, hasDemoData, removeDemoData, seedDemo } from '../../src/db/seed/demo.js';
import { buildTestApp, type TestApp } from '../support/app.js';
import { accessToken } from '../support/tokens.js';
import { createMigratedDatabase } from './helpers.js';

let db: Db;
let t: TestApp;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const staff = (role: string) => accessToken({ email: DEMO_STAFF.find((s) => s.role === role)!.email, mfa: true });
const get = (url: string, token?: string) => t.app.inject({ method: 'GET', url, headers: token ? auth(token) : {} });

beforeAll(async () => {
  db = await createMigratedDatabase('demo', { seed: true });
  t = await buildTestApp(db);
  await seedDemo({ db, storage: t.storage, now: new Date() });
}, 120_000);
afterAll(async () => {
  await t?.app.close();
  await db?.$client.end();
});

describe('demo data', () => {
  it('creates the prototype reports, the recurring ones, citizens and staff, all on the demo domain', async () => {
    const [counts] = await db.execute<{ reports: number; accounts: number; photos: number; comments: number }>(sql`
      SELECT (SELECT count(*)::int FROM report) AS reports,
             (SELECT count(*)::int FROM account WHERE email LIKE ${`%@${DEMO_DOMAIN}`}) AS accounts,
             (SELECT count(*)::int FROM photo WHERE blur_status = 'done') AS photos,
             (SELECT count(*)::int FROM comment) AS comments`);
    expect(counts!.reports).toBe(DEMO_REPORTS.length + 2);
    expect(counts!.accounts).toBe(60 + 15 + DEMO_STAFF.length);
    expect(counts!.photos).toBe(DEMO_REPORTS.reduce((n, r) => n + r.scenes.length, 0) + 2);
    expect(counts!.comments).toBeGreaterThan(20);
  });

  it('shows citizens public reports with blurred-copy photos and comments, nothing in processing', async () => {
    const list = (await get('/public/reports?lat=52.4812&lon=13.4352&radiusM=10000&limit=200')).json().reports;
    expect(list.length).toBeGreaterThanOrEqual(8);
    const light = list.find((r: { category: string }) => r.category === 'traffic_light');
    expect(light).toMatchObject({ status: 'acknowledged', meTooCount: 20, publicNote: expect.stringContaining('Lichtsignalanlagen') });
    const detail = (await get(`/public/reports/${light.publicId}`)).json();
    expect(detail.photos).toHaveLength(1);
    const key = detail.photos[0].url.replace('https://photos.test/public/', '');
    const meta = await sharp(t.storage.publicObjects.get(key)!).metadata();
    expect(meta).toMatchObject({ format: 'jpeg', width: 1200, height: 900 });
    expect(meta.exif).toBeUndefined();
    const comments = (await get(`/public/reports/${light.publicId}/comments`)).json().comments;
    expect(comments.map((c: { body: string }) => c.body)).toContain('Hier queren um 8 Uhr die Kinder von der Schule.');
  });

  it('gives the console a scored queue, a flagged spike, a moderation queue and a recurring hotspot', async () => {
    const worker = staff('case_worker');
    const queue = (await get('/staff/reports', worker)).json().reports;
    expect(queue[0]).toMatchObject({ category: 'traffic_light', level: 'Critical' });
    expect(queue.every((r: { tenant: { name: string } }) => r.tenant.name === 'Neukölln')).toBe(true);
    expect(queue.find((r: { category: string }) => r.category === 'youth_centre')).toMatchObject({ spike: true });

    const moderation = (await get('/staff/moderation', worker)).json();
    expect(moderation.comments.map((c: { state: string }) => c.state).sort()).toEqual(['held', 'visible']);
    const hotspot = (await get('/staff/hotspots', worker)).json().clusters.find((c: { group: string; count: number }) => c.group === 'community' && c.count >= 3);
    expect(hotspot).toMatchObject({ recurring: true, weekdayPattern: 'mon' });

    const duplicates = await get(`/staff/reports/${queue.find((r: { description: string }) => r.description?.includes('Nr. 108')).publicId}/duplicates`, worker);
    expect(duplicates.json().matches).toHaveLength(1);
  });

  it('writes this week\'s briefing for both Bezirke, and the Berlin viewer sees both', async () => {
    const [n] = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM briefing`);
    expect(n!.n).toBe(2);
    const tenants = new Set((await get('/staff/reports?status=all&limit=200', staff('viewer'))).json().reports.map((r: { tenant: { name: string } }) => r.tenant.name));
    expect(tenants).toEqual(new Set(['Neukölln', 'Spandau']));
  });

  it('is not added twice, and removal leaves no demo account, report or contact', async () => {
    expect((await seedDemo({ db, storage: t.storage })).skipped).toBe(true);
    // A real report next to the demo data must survive removal.
    await db.execute(sql`
      INSERT INTO account (email) VALUES ('real@example.org');
      INSERT INTO report (public_id, tenant_id, category, location, capture_location, capture_at, created_by)
      SELECT 'BE-NK-2026-9999', t.id, 'pothole', ST_SetSRID(ST_MakePoint(13.44, 52.48), 4326)::geography,
             ST_SetSRID(ST_MakePoint(13.44, 52.48), 4326)::geography, now(), a.id
      FROM tenant t, account a WHERE t.path = 'de.be.bec.nk' AND a.email = 'real@example.org'`);
    expect(await removeDemoData(db)).toBe(60 + 15 + DEMO_STAFF.length);
    expect(await hasDemoData(db)).toBe(false);
    const [left] = await db.execute<{ reports: string[]; contacts: number }>(sql`
      SELECT (SELECT array_agg(public_id) FROM report) AS reports, (SELECT count(*)::int FROM external_contact) AS contacts`);
    expect(left).toEqual({ reports: ['BE-NK-2026-9999'], contacts: 0 });
  });
});
