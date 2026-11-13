// Analysis and AI (Phase 3) against the real migrations and tenant seed, with a fake AI provider and blur detector:
// photo pipeline (US-16, US-31), suggestions (US-14), duplicates and co-reporting (US-13, US-17), hotspots (US-50,
// US-52), trends (US-51), briefings (US-53, US-54, US-56, D-13, D-17) and exports (US-55).
import { eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateBriefing, sendBriefingEmails } from '../../src/analysis/briefing.js';
import type { Db } from '../../src/db/client.js';
import { noDetector } from '../../src/photos/blur.js';
import { processPendingPhotos } from '../../src/photos/process.js';
import { photo, report, tenant } from '../../src/db/schema.js';
import { recomputeScores } from '../../src/scoring/recompute.js';
import { buildTestApp, signIn, uploadPhotoBytes, type TestApp } from '../support/app.js';
import { FACE, FakeAiProvider, FakeDetector, FakeMailer, PLATE, regionDetail, testPhoto } from '../support/fakes.js';
import { grantRole, staffSignIn } from '../support/staff.js';
import { createMigratedDatabase } from './helpers.js';

const KMS100 = { lat: 52.4795, lon: 13.4365 };
const north = (p: { lat: number; lon: number }, m: number) => ({ lat: p.lat + m / 111_195, lon: p.lon });

let db: Db;
let t: TestApp;
let ai: FakeAiProvider;
let detector: FakeDetector;
let citizen: string;
let photoBytes: Buffer;
let n = 0;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const pipeline = (over: Partial<Parameters<typeof processPendingPhotos>[0]> = {}) =>
  processPendingPhotos({ db, storage: t.storage, detector, ai, ...over });

async function post(token: string, o: { at?: { lat: number; lon: number }; category?: string; suggestion?: object } = {}) {
  const key = await uploadPhotoBytes(t, token, photoBytes);
  const res = await t.app.inject({
    method: 'POST',
    url: '/reports',
    headers: auth(token),
    payload: {
      category: o.category ?? 'pothole',
      capture: { ...(o.at ?? KMS100), accuracyM: 10, capturedAt: new Date().toISOString() },
      photoKeys: [key],
      suggestion: o.suggestion,
    },
  });
  if (res.statusCode !== 201) throw new Error(res.body);
  return { publicId: res.json().publicId as string, key };
}

/** Posts and runs the pipeline so the report is public with a blurred photo and an embedding. */
async function postPublic(token: string, o: Parameters<typeof post>[1] = {}) {
  const posted = await post(token, o);
  await pipeline();
  return posted.publicId;
}

beforeAll(async () => {
  db = await createMigratedDatabase('analysis', { seed: true });
  ai = new FakeAiProvider();
  detector = new FakeDetector();
  detector.regions = [FACE, PLATE];
  t = await buildTestApp(db, { ai });
  citizen = await signIn(t, 'analyst-citizen@example.org');
  photoBytes = await testPhoto();
});
afterAll(async () => {
  await t?.app.close();
  await db?.$client.end();
});

describe('photo pipeline (US-16, US-31)', () => {
  it('blurs the face and the plate, strips EXIF, stores the copy publicly and publishes the report', async () => {
    const { publicId } = await post(citizen);
    expect((await t.app.inject({ method: 'GET', url: `/public/reports/${publicId}` })).statusCode).toBe(404);

    expect(await pipeline()).toMatchObject({ done: 1, failed: 0 });
    const [p] = await db.select().from(photo).innerJoin(report, eq(report.id, photo.reportId)).where(eq(report.publicId, publicId));
    expect(p!.photo).toMatchObject({ blurStatus: 'done', aiCategory: 'pothole', publicKey: `public/${p!.photo.id}.jpg` });
    expect(p!.photo.phash).toMatch(/^[0-9a-f]{16}$/);
    expect(p!.photo.embedding).toBeTruthy();
    expect(p!.report.status).toBe('open');

    const copy = t.storage.publicObjects.get(p!.photo.publicKey!)!;
    expect((await sharp(copy).metadata()).exif).toBeUndefined();
    expect(await regionDetail(copy, FACE)).toBeLessThan(5);
    expect(await regionDetail(copy, PLATE)).toBeLessThan(5);
    expect(await regionDetail(photoBytes, FACE)).toBeGreaterThan(30);

    const detail = (await t.app.inject({ method: 'GET', url: `/public/reports/${publicId}` })).json();
    expect(detail.photos).toEqual([{ url: `https://photos.test/public/public/${p!.photo.id}.jpg` }]);
  });

  it('leaves photos waiting without a detector, and publishes nothing', async () => {
    const { publicId } = await post(citizen);
    expect(await pipeline({ detector: noDetector })).toMatchObject({ waiting: 1 });
    const [r] = await db.select({ status: report.status }).from(report).where(eq(report.publicId, publicId));
    expect(r!.status).toBe('processing');
    await pipeline();
  });

  it('holds the report for moderation after 3 failed blurs and never publishes it', async () => {
    const { publicId } = await post(citizen);
    detector.failures = 3;
    for (let i = 0; i < 3; i++) await pipeline();
    const [p] = await db.select().from(photo).innerJoin(report, eq(report.id, photo.reportId)).where(eq(report.publicId, publicId));
    expect(p!.photo).toMatchObject({ blurStatus: 'failed', failureReason: 'blur_failed', attempts: 3, publicKey: null });
    expect(p!.report.status).toBe('in_moderation');
    expect((await t.app.inject({ method: 'GET', url: `/public/reports/${publicId}` })).statusCode).toBe(404);
    expect(t.storage.publicObjects.has(`public/${p!.photo.id}.jpg`)).toBe(false);
  });

  it('refuses originals over 15 MB', async () => {
    const { publicId, key } = await post(citizen);
    t.storage.objects.set(key, Buffer.alloc(15 * 1024 * 1024 + 1));
    await pipeline();
    const [p] = await db.select().from(photo).innerJoin(report, eq(report.id, photo.reportId)).where(eq(report.publicId, publicId));
    expect(p!.photo).toMatchObject({ blurStatus: 'failed', failureReason: 'too_large' });
    expect(p!.report.status).toBe('in_moderation');
  });

  it('still publishes when the AI provider fails', async () => {
    ai.insight = new Error('provider down');
    const { publicId } = await post(citizen);
    await pipeline();
    const [p] = await db.select().from(photo).innerJoin(report, eq(report.id, photo.reportId)).where(eq(report.publicId, publicId));
    expect(p!.photo).toMatchObject({ blurStatus: 'done', aiCategory: null, embedding: null });
    expect(p!.report.status).toBe('open');
    ai.insight = { category: 'pothole', confidence: 0.92, caption: 'A deep pothole in the road.' };
  });
});

describe('category suggestion (US-14)', () => {
  const suggest = async (key: string, token = citizen) => (await t.app.inject({ method: 'POST', url: '/uploads/suggest', headers: auth(token), payload: { key } })).json();

  it('pre-selects from 0.80 confidence, and only suggests below it', async () => {
    const key = await uploadPhotoBytes(t, citizen, photoBytes);
    expect(await suggest(key)).toEqual({ category: 'pothole', confidence: 0.92, preselect: true });
    ai.insight = { category: 'street_lighting', confidence: 0.79, caption: 'A dark street lamp.' };
    expect(await suggest(key)).toEqual({ category: 'street_lighting', confidence: 0.79, preselect: false });
    ai.insight = { category: 'pothole', confidence: 0.92, caption: 'A deep pothole in the road.' };
  });

  it('answers with nothing after 3 seconds or on an error, never failing the request', async () => {
    const key = await uploadPhotoBytes(t, citizen, photoBytes);
    ai.delayMs = 5_000;
    const started = Date.now();
    expect(await suggest(key)).toEqual({ category: null, confidence: null, preselect: false });
    expect(Date.now() - started).toBeLessThan(4_500);
    ai.delayMs = 0;
    ai.insight = new Error('down');
    expect(await suggest(key)).toEqual({ category: null, confidence: null, preselect: false });
    ai.insight = { category: 'pothole', confidence: 0.92, caption: 'A deep pothole in the road.' };
  });

  it("refuses someone else's photo", async () => {
    const other = await signIn(t, `other${++n}@example.org`);
    const key = await uploadPhotoBytes(t, other, photoBytes);
    const res = await t.app.inject({ method: 'POST', url: '/uploads/suggest', headers: auth(citizen), payload: { key } });
    expect(res.json()).toEqual({ error: 'photo_missing' });
  });

  it('logs the suggestion as feedback when the citizen chose another category', async () => {
    const changed = await post(citizen, { category: 'bike_lane', suggestion: { category: 'pothole', confidence: 0.92 } });
    const kept = await post(citizen, { category: 'pothole', suggestion: { category: 'pothole', confidence: 0.92 } });
    const rows = await db.execute<{ public_id: string; suggested: string; chosen: string }>(sql`
      SELECT r.public_id, f.suggested, f.chosen FROM category_feedback f JOIN report r ON r.id = f.report_id
      WHERE r.public_id IN (${changed.publicId}, ${kept.publicId})`);
    expect([...rows]).toEqual([{ public_id: changed.publicId, suggested: 'pothole', chosen: 'bike_lane' }]);
    await pipeline();
  });
});

describe('"Already reported?" and co-reporting (US-13)', () => {
  let target: string;
  beforeAll(async () => {
    target = await postPublic(citizen, { at: north(KMS100, -2000) });
    await postPublic(citizen, { at: north(north(KMS100, -2000), 40), category: 'waste_bins' });
    await postPublic(citizen, { at: north(north(KMS100, -2000), 400) });
  });

  it('finds public reports within 150 m in the same category group, with the most similar photo first', async () => {
    const key = await uploadPhotoBytes(t, citizen, photoBytes);
    const res = await t.app.inject({
      method: 'POST',
      url: '/reports/duplicates',
      headers: auth(citizen),
      payload: { ...north(north(KMS100, -2000), 30), category: 'bike_lane', photoKey: key },
    });
    const matches = res.json().matches;
    expect(matches.map((m: { publicId: string }) => m.publicId)).toEqual([target]);
    expect(matches[0]).toMatchObject({ category: 'pothole', distanceM: 30, photo: expect.stringMatching(/^https:\/\/photos\.test\/public\//) });
    expect(matches[0].similarity).toBeCloseTo(1, 5);
  });

  it('adds the photo to the report and makes the citizen a co-reporter who follows it', async () => {
    const helper = await signIn(t, `helper${++n}@example.org`);
    const key = await uploadPhotoBytes(t, helper, photoBytes);
    const capture = { ...north(north(KMS100, -2000), 20), accuracyM: 10, capturedAt: new Date().toISOString() };
    const res = await t.app.inject({ method: 'POST', url: `/reports/${target}/co-report`, headers: auth(helper), payload: { capture, photoKeys: [key] } });
    expect(res.statusCode).toBe(201);
    expect((await t.app.inject({ method: 'GET', url: `/reports/${target}/me`, headers: auth(helper) })).json()).toMatchObject({ following: true });
    const [r] = await db.execute<{ photos: number; co: number }>(sql`
      SELECT (SELECT count(*)::int FROM photo p WHERE p.report_id = r.id) AS photos,
             (SELECT count(*)::int FROM reaction x WHERE x.report_id = r.id AND x.kind = 'co_reporter') AS co
      FROM report r WHERE r.public_id = ${target}`);
    expect(r).toEqual({ photos: 2, co: 1 });

    const far = { ...capture, ...north(north(KMS100, -2000), 300) };
    const key2 = await uploadPhotoBytes(t, helper, photoBytes);
    expect((await t.app.inject({ method: 'POST', url: `/reports/${target}/co-report`, headers: auth(helper), payload: { capture: far, photoKeys: [key2] } })).json()).toEqual({ error: 'not_on_site' });
    await pipeline();
  });
});

describe('console analysis (US-17, US-50, US-51, US-55)', () => {
  let worker: string;
  let cluster: string[];
  beforeAll(async () => {
    await grantRole(db, 'analyst@neukoelln.example', 'de.be.bec.nk', 'case_worker');
    worker = await staffSignIn(t, 'analyst@neukoelln.example');
    const base = north(KMS100, -4000);
    cluster = [];
    for (const m of [0, 60, 120]) cluster.push(await postPublic(citizen, { at: north(base, m), category: 'street_lighting' }));
    await recomputeScores(db);
  });
  const get = (url: string) => t.app.inject({ method: 'GET', url, headers: auth(worker) });

  it('suggests merges by similarity within 150 m of the same tenant', async () => {
    const matches = (await get(`/staff/reports/${cluster[0]}/duplicates`)).json().matches;
    // Both others are within 150 m (60 m and 120 m); equally similar, so the nearer comes first.
    expect(matches.map((m: { publicId: string }) => m.publicId)).toEqual([cluster[1], cluster[2]]);
    expect(matches[0].similarity).toBeCloseTo(1, 5);
  });

  it('clusters reports within 150 m of the same group as a recurring hotspot', async () => {
    const clusters = (await get('/staff/hotspots')).json().clusters;
    const hit = clusters.find((c: { publicIds: string[] }) => c.publicIds.includes(cluster[0]!));
    expect(hit).toMatchObject({ group: 'traffic', count: 3, recurring: true, publicIds: cluster });
    expect(['Low', 'Medium', 'High', 'Critical']).toContain(hit.level);
  });

  it('counts this week per category and times the first reaction', async () => {
    await t.app.inject({ method: 'PATCH', url: `/staff/reports/${cluster[0]}/status`, headers: auth(worker), payload: { status: 'acknowledged' } });
    const trends = (await get('/staff/trends')).json();
    expect(trends.weeks).toHaveLength(8);
    const lights = trends.categories.find((c: { category: string }) => c.category === 'street_lighting');
    expect(lights.counts.at(-1)).toBe(3);
    expect(lights.fourWeekAverage).toBe(0);
    expect(lights.change).toBe(3);
    expect(trends.medianHoursToAcknowledge).toBeGreaterThanOrEqual(0);
  });

  it('exports the queue and the trends as CSV', async () => {
    const queue = await get('/staff/export/queue.csv');
    expect(queue.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(queue.headers['content-disposition']).toBe('attachment; filename="kiezruf-queue.csv"');
    expect(queue.body.split('\r\n')[0]).toBe('public_id,tenant,category,status,level,score,me_too,created_at,updated_at');
    expect(queue.body).toContain(cluster[0]);
    expect(queue.body).not.toContain('BE-SP-');
    const trendCsv = await get('/staff/export/trends.csv');
    expect(trendCsv.body.split('\r\n')[0]).toMatch(/^category,\d{4}-\d{2}-\d{2},.*,four_week_average,change$/);
  });

  it('answers 404 for a tenant outside the scope', async () => {
    const [sp] = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.path, 'de.be.bec.sp'));
    expect((await get(`/staff/hotspots?tenantId=${sp!.id}`)).statusCode).toBe(404);
    expect((await get(`/staff/export/queue.csv?tenantId=${sp!.id}`)).statusCode).toBe(404);
  });
});

describe('weekly briefing (US-53, US-54, US-56, D-13, D-17)', () => {
  const MONDAY = new Date('2026-11-16T05:00:00Z');
  let nk: string;
  beforeAll(async () => {
    [{ id: nk }] = (await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.path, 'de.be.bec.nk'))) as [{ id: string }];
    await recomputeScores(db);
  });

  it('keeps at most 5 items, all citing reports of the tenant, labelled AI-written', async () => {
    const id = await generateBriefing({ db, ai }, nk, MONDAY);
    const items = await db.execute<{ citations: string[] }>(sql`SELECT citations FROM briefing_item WHERE briefing_id = ${id} ORDER BY position`);
    expect(items.length).toBe(5);
    expect(items.every((i) => i.citations.length > 0 && i.citations.every((c) => c.startsWith('BE-NK-')))).toBe(true);
    const [b] = await db.execute<{ ai_written: boolean; fallback: boolean; prompt_version: string; dropped_items: number }>(sql`
      SELECT ai_written, fallback, prompt_version, dropped_items FROM briefing WHERE id = ${id}`);
    expect(b).toMatchObject({ ai_written: true, fallback: false, dropped_items: 2 });
    expect(b!.prompt_version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it('drops an item citing a report outside the tenant, and sent only pseudonymised text', async () => {
    const [sp] = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.path, 'de.be.bec.sp'));
    const spReport = await postPublic(citizen, { at: { lat: 52.5352, lon: 13.2 } });
    const top = (await db.execute<{ public_id: string }>(sql`
      SELECT r.public_id FROM report r JOIN report_score s ON s.report_id = r.id
      WHERE r.tenant_path = 'de.be.bec.sp' AND r.status = 'open' ORDER BY s.score DESC LIMIT 1`))[0]!.public_id;
    const [r] = await db.select({ id: report.id }).from(report).where(eq(report.publicId, top));
    const [anyAccount] = await db.execute<{ id: string }>(sql`SELECT id FROM account LIMIT 1`);
    await db.execute(sql`INSERT INTO comment (report_id, account_id, body) VALUES (${r!.id}, ${anyAccount!.id}, 'Call me, Anna, on 0171 1234567')`);
    ai.briefingAnswer = (input) => ({
      items: [
        { level: 'High', kind: 'Urgent', headline: 'Falsch', text: 'x', citations: ['BE-NK-2026-0001'] },
        { level: 'High', kind: 'Watch', headline: 'Richtig', text: 'Siehe Meldung.', citations: [input.reports[0]!.publicId] },
      ],
    });
    const id = await generateBriefing({ db, ai }, sp!.id, MONDAY);
    const items = await db.execute<{ headline: string }>(sql`SELECT headline FROM briefing_item WHERE briefing_id = ${id}`);
    expect(items.map((i) => i.headline)).toEqual(['Richtig']);
    const sent = JSON.stringify(ai.briefingInputs.at(-1));
    expect(sent).toContain('[Name]');
    expect(sent).not.toContain('Anna');
    expect(sent).not.toContain('0171 1234567');
    expect(spReport).toMatch(/^BE-SP-/);
    ai.briefingAnswer = new FakeAiProvider().briefingAnswer;
  });

  it('falls back to the top reports, not AI-written, without an AI provider', async () => {
    const [be] = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.path, 'de.be.bec'));
    const id = await generateBriefing({ db }, be!.id, MONDAY);
    const [b] = await db.execute<{ ai_written: boolean; fallback: boolean; n: number }>(sql`
      SELECT ai_written, fallback, (SELECT count(*)::int FROM briefing_item WHERE briefing_id = ${id}) AS n FROM briefing WHERE id = ${id}`);
    expect(b).toEqual({ ai_written: false, fallback: true, n: 5 });
  });

  it('emails only the tenant admins, once, without photos or personal data, and respects unsubscribing', async () => {
    await grantRole(db, 'admin1@neukoelln.example', 'de.be.bec.nk', 'tenant_admin');
    await grantRole(db, 'admin2@neukoelln.example', 'de.be.bec.nk', 'tenant_admin');
    for (const w of ['w1', 'w2', 'w3']) await grantRole(db, `${w}@neukoelln.example`, 'de.be.bec.nk', 'case_worker');
    const admin2 = await staffSignIn(t, 'admin2@neukoelln.example');
    expect((await t.app.inject({ method: 'PUT', url: '/staff/me/preferences', headers: auth(admin2), payload: { briefingEmail: false } })).statusCode).toBe(200);

    const mailer = new FakeMailer();
    const result = await sendBriefingEmails({ db, mailer, webBaseUrl: 'https://kiezruf.test' }, MONDAY);
    const nkMails = mailer.sent.filter((m) => m.subject.includes('Neukölln'));
    expect(nkMails.map((m) => m.to)).toEqual(['admin1@neukoelln.example']);
    expect(result.failed).toBe(0);
    const text = nkMails[0]!.text;
    expect(text).toContain('KI-erstellt');
    expect(text).toMatch(/https:\/\/kiezruf\.test\/console\/reports\/BE-NK-/);
    expect(text).not.toMatch(/photos\.test|@|\+49|0\d{3} ?\d{5,}/);

    const again = new FakeMailer();
    await sendBriefingEmails({ db, mailer: again, webBaseUrl: 'https://kiezruf.test' }, MONDAY);
    expect(again.sent.filter((m) => m.subject.includes('Neukölln'))).toEqual([]);
  });

  it('falls back when the AI call fails, and retries a failed email on the next run', async () => {
    const [sp] = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.path, 'de.be.bec.sp'));
    const failing = new FakeAiProvider();
    failing.briefingAnswer = () => {
      throw new Error('provider down');
    };
    const logs: Record<string, unknown>[] = [];
    const nextMonday = new Date('2026-11-23T05:00:00Z');
    const id = await generateBriefing({ db, ai: failing, log: (e) => logs.push(e) }, sp!.id, nextMonday);
    const [b] = await db.execute<{ fallback: boolean }>(sql`SELECT fallback FROM briefing WHERE id = ${id}`);
    expect(b!.fallback).toBe(true);
    expect(logs).toEqual([expect.objectContaining({ job: 'briefing', ai: 'failed' })]);
    expect(await generateBriefing({ db, ai: failing }, sp!.id, nextMonday)).toBe(id);

    await grantRole(db, 'admin@spandau-briefing.example', 'de.be.bec.sp', 'tenant_admin');
    const broken = new FakeMailer();
    broken.send = async () => {
      throw new Error('SMTP down');
    };
    expect(await sendBriefingEmails({ db, mailer: broken, webBaseUrl: 'https://kiezruf.test' }, nextMonday)).toEqual({ sent: 0, failed: 1 });
    const working = new FakeMailer();
    expect(await sendBriefingEmails({ db, mailer: working, webBaseUrl: 'https://kiezruf.test' }, nextMonday)).toEqual({ sent: 1, failed: 0 });
    expect(working.sent[0]!.text).toContain('Ohne KI erstellt');
  });

  it('shows briefings in the console and keeps each staff member\'s rating', async () => {
    const token = await staffSignIn(t, 'admin1@neukoelln.example');
    const list = (await t.app.inject({ method: 'GET', url: `/staff/briefings?tenantId=${nk}`, headers: auth(token) })).json().briefings;
    expect(list[0]).toMatchObject({ weekStart: '2026-11-16', aiWritten: true, fallback: false, tenant: { name: 'Neukölln' } });
    const item = list[0].items[0];
    expect(item).toMatchObject({ kind: 'Urgent', myRating: null, citations: [expect.stringMatching(/^BE-NK-/)] });
    const rate = await t.app.inject({ method: 'POST', url: `/staff/briefings/items/${item.id}/rating`, headers: auth(token), payload: { useful: false, note: 'Already fixed' } });
    expect(rate.statusCode).toBe(204);
    const after = (await t.app.inject({ method: 'GET', url: `/staff/briefings?tenantId=${nk}`, headers: auth(token) })).json().briefings[0].items[0];
    expect(after.myRating).toEqual({ useful: false, note: 'Already fixed' });
    const [sp] = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.path, 'de.be.bec.sp'));
    expect((await t.app.inject({ method: 'GET', url: `/staff/briefings?tenantId=${sp!.id}`, headers: auth(token) })).json().briefings).toEqual([]);
  });
});
