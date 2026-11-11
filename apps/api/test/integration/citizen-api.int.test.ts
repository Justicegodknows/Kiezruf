// Citizen API against the real migrations and tenant seed: sign-in (US-01), posting (US-03, US-06, US-08, US-10,
// US-11, US-41, US-44), browsing (US-15, US-24) and Me too (US-18, D-03).
import { berlinYear } from '@kiezruf/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../src/db/client.js';
import { account, demandSignal, loginCode, photo, reaction, report, session, staffRole, tenant } from '../../src/db/schema.js';
import { loadStaffScope, withCitizenSession, withStaffScope } from '../../src/db/scope.js';
import { buildTestApp, signIn, uploadPhotos, type TestApp } from '../support/app.js';
import { createMigratedDatabase } from './helpers.js';

const KARL_MARX_STR_100 = { lat: 52.4795, lon: 13.4365 }; // Neukölln (pilot)
const RATHAUS_SPANDAU = { lat: 52.5352, lon: 13.2 }; // Spandau (pilot)
const KOTTBUSSER_TOR = { lat: 52.499, lon: 13.418 }; // Friedrichshain-Kreuzberg (not live)
const MARIENPLATZ_MUNICH = { lat: 48.1374, lon: 11.5755 }; // no tenant
const north = (p: { lat: number; lon: number }, metres: number) => ({ lat: p.lat + metres / 111_195, lon: p.lon });

let db: Db;
let t: TestApp;
let emailCounter = 0;
const newEmail = () => `citizen${++emailCounter}@example.org`;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const year = berlinYear(new Date());

beforeAll(async () => {
  db = await createMigratedDatabase('citizen_api', { seed: true });
  t = await buildTestApp(db);
});
afterAll(async () => {
  await t?.app.close();
  await db?.$client.end();
});

interface PostOptions {
  at?: { lat: number; lon: number };
  accuracyM?: number | null;
  capturedAt?: string | null;
  category?: string;
  description?: string;
  pin?: { lat: number; lon: number };
  photoKeys?: string[];
}

async function post(token: string, o: PostOptions = {}) {
  const at = o.at ?? KARL_MARX_STR_100;
  return t.app.inject({
    method: 'POST',
    url: '/reports',
    headers: auth(token),
    payload: {
      category: o.category ?? 'pothole',
      description: o.description,
      capture: {
        ...at,
        accuracyM: o.accuracyM === undefined ? 20 : o.accuracyM,
        capturedAt: o.capturedAt === undefined ? new Date().toISOString() : o.capturedAt,
      },
      pin: o.pin,
      photoKeys: o.photoKeys ?? (await uploadPhotos(t, token)),
    },
  });
}

/** Makes a posted report public, as the blur job will once it exists (Phase 3). */
async function publish(publicId: string) {
  await db.update(report).set({ status: 'open' }).where(eq(report.publicId, publicId));
}

const countReports = async () => (await db.select({ n: sql<number>`count(*)::int` }).from(report))[0]!.n;

async function countSignals(tenantName: string | null) {
  const [row] = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM demand_signal d LEFT JOIN tenant t ON t.id = d.tenant_id
    WHERE ${tenantName === null ? sql`d.tenant_id IS NULL` : sql`t.name = ${tenantName}`}`);
  return row!.n;
}

describe('sign-in with an email one-time code (US-01)', () => {
  it('mails a 6-digit code, in German by default', async () => {
    const email = newEmail();
    const res = await t.app.inject({ method: 'POST', url: '/auth/code', payload: { email } });
    expect(res.statusCode).toBe(202);
    const mail = t.mailer.sent.at(-1)!;
    expect(mail.to).toBe(email);
    expect(mail.subject).toMatch(/^\d{6} ist Ihr Kiezruf-Code$/);
    expect(mail.text).toContain('10 Minuten');
  });

  it('mails the code in English when asked', async () => {
    await t.app.inject({ method: 'POST', url: '/auth/code', payload: { email: newEmail(), locale: 'en' } });
    expect(t.mailer.sent.at(-1)!.subject).toMatch(/^\d{6} is your Kiezruf code$/);
  });

  it('stores only a hash of the code', async () => {
    const email = newEmail();
    await t.app.inject({ method: 'POST', url: '/auth/code', payload: { email } });
    const code = t.mailer.lastCodeFor(email);
    const [row] = await db.select().from(loginCode).where(eq(loginCode.email, email));
    expect(row!.codeHash).not.toContain(code);
    expect(row!.codeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('creates the account on first sign-in and reuses it after that', async () => {
    const email = newEmail();
    await t.app.inject({ method: 'POST', url: '/auth/code', payload: { email } });
    const first = await t.app.inject({ method: 'POST', url: '/auth/verify', payload: { email, code: t.mailer.lastCodeFor(email) } });
    expect(first.json()).toMatchObject({ newAccount: true });

    // Same address in another spelling: same account.
    const upper = `  ${email.toUpperCase()} `;
    await t.app.inject({ method: 'POST', url: '/auth/code', payload: { email: upper.trim() } });
    const second = await t.app.inject({ method: 'POST', url: '/auth/verify', payload: { email: upper.trim(), code: t.mailer.lastCodeFor(email) } });
    expect(second.json()).toMatchObject({ newAccount: false });

    const me = await t.app.inject({ method: 'GET', url: '/me', headers: auth(second.json().token) });
    expect(me.json()).toMatchObject({ email, locale: 'de' });
    // Every acting account has a confirmed email (US-37).
    const [row] = await db.select({ verifiedAt: account.verifiedAt }).from(account).where(eq(account.email, email));
    expect(row!.verifiedAt).toBeInstanceOf(Date);
  });

  it('rejects a wrong code and locks the code after 5 tries', async () => {
    const email = newEmail();
    await t.app.inject({ method: 'POST', url: '/auth/code', payload: { email } });
    const right = t.mailer.lastCodeFor(email);
    const wrong = right === '000000' ? '111111' : '000000';
    const tries = [];
    for (let i = 0; i < 5; i++) {
      tries.push((await t.app.inject({ method: 'POST', url: '/auth/verify', payload: { email, code: wrong } })).json().error);
    }
    expect(tries).toEqual(['invalid_code', 'invalid_code', 'invalid_code', 'invalid_code', 'too_many_attempts']);
    const after = await t.app.inject({ method: 'POST', url: '/auth/verify', payload: { email, code: right } });
    expect(after.json()).toEqual({ error: 'invalid_code' });
  });

  it('rejects an expired code', async () => {
    const email = newEmail();
    await t.app.inject({ method: 'POST', url: '/auth/code', payload: { email } });
    await db.update(loginCode).set({ expiresAt: sql`now() - interval '1 second'` }).where(eq(loginCode.email, email));
    const res = await t.app.inject({ method: 'POST', url: '/auth/verify', payload: { email, code: t.mailer.lastCodeFor(email) } });
    expect(res.json()).toEqual({ error: 'invalid_code' });
  });

  it('retires the older code when a new one is requested', async () => {
    const email = newEmail();
    await t.app.inject({ method: 'POST', url: '/auth/code', payload: { email } });
    const old = t.mailer.lastCodeFor(email);
    await t.app.inject({ method: 'POST', url: '/auth/code', payload: { email } });
    const fresh = t.mailer.lastCodeFor(email);
    if (old !== fresh) {
      const res = await t.app.inject({ method: 'POST', url: '/auth/verify', payload: { email, code: old } });
      expect(res.json()).toEqual({ error: 'invalid_code' });
    }
    const ok = await t.app.inject({ method: 'POST', url: '/auth/verify', payload: { email, code: fresh } });
    expect(ok.statusCode).toBe(200);
  });

  it('sends at most 5 codes per address per hour', async () => {
    const email = newEmail();
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await t.app.inject({ method: 'POST', url: '/auth/code', payload: { email } })).statusCode);
    }
    expect(statuses).toEqual([202, 202, 202, 202, 202, 429]);
  });

  it('ends the session on logout', async () => {
    const token = await signIn(t, newEmail());
    expect((await t.app.inject({ method: 'GET', url: '/me', headers: auth(token) })).statusCode).toBe(200);
    expect((await t.app.inject({ method: 'POST', url: '/auth/logout', headers: auth(token) })).statusCode).toBe(204);
    expect((await t.app.inject({ method: 'GET', url: '/me', headers: auth(token) })).statusCode).toBe(401);
  });

  it('rejects an expired session and a session of a deleted account', async () => {
    const expired = await signIn(t, newEmail());
    await db.update(session).set({ expiresAt: sql`now() - interval '1 second'` });
    expect((await t.app.inject({ method: 'GET', url: '/me', headers: auth(expired) })).statusCode).toBe(401);

    const email = newEmail();
    const token = await signIn(t, email);
    await db.update(account).set({ deletedAt: sql`now()`, email: null }).where(eq(account.email, email));
    expect((await t.app.inject({ method: 'GET', url: '/me', headers: auth(token) })).statusCode).toBe(401);
  });

  it('gives citizen sessions 30 days', async () => {
    const email = newEmail();
    await t.app.inject({ method: 'POST', url: '/auth/code', payload: { email } });
    const res = await t.app.inject({ method: 'POST', url: '/auth/verify', payload: { email, code: t.mailer.lastCodeFor(email) } });
    const days = (new Date(res.json().expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
  });
});

describe('posting a report (US-03, US-41, US-44)', () => {
  let token: string;
  beforeAll(async () => {
    token = await signIn(t, newEmail());
  });

  it('assigns a report at Karl-Marx-Straße 100 to Neukölln with a BE-NK ID', async () => {
    const res = await post(token);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      publicId: expect.stringMatching(new RegExp(`^BE-NK-${year}-\\d{4}$`)),
      status: 'processing',
      tenant: { name: 'Neukölln', office: 'Bezirksamt Neukölln' },
    });
    const [row] = await db.execute<{ path: string; photos: number }>(sql`
      SELECT r.tenant_path::text AS path, (SELECT count(*)::int FROM photo p WHERE p.report_id = r.id) AS photos
      FROM report r WHERE r.public_id = ${res.json().publicId}`);
    expect(row).toEqual({ path: 'de.be.bec.nk', photos: 1 });
  });

  it('numbers reports per tenant and year without gaps', async () => {
    const nk = [(await post(token)).json().publicId, (await post(token)).json().publicId];
    const sp = (await post(token, { at: RATHAUS_SPANDAU })).json().publicId;
    const seq = (id: string) => Number(id.slice(-4));
    expect(seq(nk[1])).toBe(seq(nk[0]) + 1);
    expect(sp).toMatch(new RegExp(`^BE-SP-${year}-\\d{4}$`));
  });

  it('keeps up to 3 photos and refuses a 4th', async () => {
    expect((await post(token, { photoKeys: await uploadPhotos(t, token, 3) })).statusCode).toBe(201);
    const four = await post(token, { photoKeys: await uploadPhotos(t, token, 4) });
    expect(four.statusCode).toBe(400);
    expect(four.json()).toEqual({ error: 'invalid_request', fields: ['photoKeys'] });
  });

  it.each([
    [{ accuracyM: 101 }, 'accuracy_too_low'],
    [{ capturedAt: new Date(Date.now() - 49 * 3_600_000).toISOString() }, 'capture_too_old'],
    [{ capturedAt: null }, 'no_metadata'],
    [{ accuracyM: null }, 'no_metadata'],
    [{ category: 'traffic_other' }, 'description_required'],
    [{ pin: north(KARL_MARX_STR_100, 60) }, 'pin_too_far'],
  ] as [PostOptions, string][])('refuses %j with %s and creates nothing', async (options, error) => {
    const before = await countReports();
    const res = await post(token, options);
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error });
    expect(await countReports()).toBe(before);
  });

  it('allows posting at exactly 100 m accuracy', async () => {
    expect((await post(token, { accuracyM: 100 })).statusCode).toBe(201);
  });

  it('accepts "Other" with a description', async () => {
    expect((await post(token, { category: 'community_other', description: 'Broken bench' })).statusCode).toBe(201);
  });

  it('keeps the capture point private and uses the adjusted pin as the public location (US-10)', async () => {
    const pin = north(KARL_MARX_STR_100, 30);
    const res = await post(token, { pin });
    expect(res.statusCode).toBe(201);
    const [row] = await db.execute<{ pin_m: number; capture_m: number }>(sql`
      SELECT round(ST_Distance(location, ST_SetSRID(ST_MakePoint(${pin.lon}, ${pin.lat}), 4326)::geography)) AS pin_m,
             round(ST_Distance(capture_location, ST_SetSRID(ST_MakePoint(${KARL_MARX_STR_100.lon}, ${KARL_MARX_STR_100.lat}), 4326)::geography)) AS capture_m
      FROM report WHERE public_id = ${res.json().publicId}`);
    expect(row).toEqual({ pin_m: 0, capture_m: 0 });
  });

  it('refuses photos that were not uploaded, or were uploaded by someone else', async () => {
    const other = await signIn(t, newEmail());
    const [foreign] = await uploadPhotos(t, other);
    expect((await post(token, { photoKeys: [foreign!] })).json()).toEqual({ error: 'photo_missing' });

    const [mine] = await uploadPhotos(t, token);
    t.storage.uploaded.delete(mine!);
    expect((await post(token, { photoKeys: [mine!] })).json()).toEqual({ error: 'photo_missing' });

    const [twice] = await uploadPhotos(t, token);
    expect((await post(token, { photoKeys: [twice!, twice!] })).json()).toEqual({ error: 'duplicate_photo' });
  });

  it('answers "not live" inside a not-live Bezirk, creates no report and records one demand signal', async () => {
    const reports = await countReports();
    const signals = await countSignals('Friedrichshain-Kreuzberg');
    const res = await post(token, { at: KOTTBUSSER_TOR });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: 'not_live', tenant: 'Friedrichshain-Kreuzberg' });
    expect(await countReports()).toBe(reports);
    expect(await countSignals('Friedrichshain-Kreuzberg')).toBe(signals + 1);
  });

  it('answers "not live" outside every tenant and counts the attempt without an area', async () => {
    const signals = await countSignals(null);
    expect((await post(token, { at: MARIENPLATZ_MUNICH })).json()).toEqual({ error: 'not_live', tenant: null });
    expect(await countSignals(null)).toBe(signals + 1);
  });

  it('stores no account and no location with a demand signal', async () => {
    const columns = Object.keys((await db.select().from(demandSignal).limit(1))[0]!).sort();
    expect(columns).toEqual(['createdAt', 'id', 'tenantId']);
  });

  it('lists the citizen\'s own reports, including ones not public yet (US-11)', async () => {
    const mine = await signIn(t, newEmail());
    const posted = (await post(mine)).json().publicId;
    await post(token);
    const res = await t.app.inject({ method: 'GET', url: '/me/reports', headers: auth(mine) });
    expect(res.json().reports).toEqual([
      expect.objectContaining({ publicId: posted, status: 'processing', tenantName: 'Neukölln', office: 'Bezirksamt Neukölln' }),
    ]);
  });
});

describe('browsing without an account (US-01, US-15, US-24)', () => {
  let publicId: string;
  let processingId: string;
  beforeAll(async () => {
    const token = await signIn(t, newEmail());
    publicId = (await post(token, { category: 'street_lighting', description: 'Lamp out' })).json().publicId;
    processingId = (await post(token, { category: 'street_lighting' })).json().publicId;
    await publish(publicId);
  });

  const PUBLIC_KEYS = ['category', 'createdAt', 'dangerous', 'description', 'lat', 'lon', 'meTooCount', 'office', 'publicId', 'status', 'tenantName', 'updatedAt'];

  it('lists public reports near a point, nearest first, with no score, level, capture data or author', async () => {
    const res = await t.app.inject({ method: 'GET', url: `/public/reports?lat=${KARL_MARX_STR_100.lat}&lon=${KARL_MARX_STR_100.lon}&category=street_lighting` });
    expect(res.statusCode).toBe(200);
    const reports = res.json().reports as Record<string, unknown>[];
    expect(reports.map((r) => r.publicId)).toEqual([publicId]);
    expect(Object.keys(reports[0]!).sort()).toEqual([...PUBLIC_KEYS, 'distanceM'].sort());
    expect(reports[0]).toMatchObject({ status: 'open', meTooCount: 0, distanceM: 0, tenantName: 'Neukölln' });
  });

  it('filters by status and leaves out reports further than the radius', async () => {
    const q = (extra: string) => t.app.inject({ method: 'GET', url: `/public/reports?lat=${RATHAUS_SPANDAU.lat}&lon=${RATHAUS_SPANDAU.lon}&category=street_lighting${extra}` });
    expect((await q('')).json().reports).toEqual([]);
    expect((await q('&radiusM=10000&status=resolved')).json().reports).toEqual([]);
  });

  it('shows one public report with its blurred photos only', async () => {
    const [p] = await db.execute<{ id: string }>(sql`SELECT p.id FROM photo p JOIN report r ON r.id = p.report_id WHERE r.public_id = ${publicId}`);
    await db.update(photo).set({ blurStatus: 'done', publicKey: `blurred/${p!.id}.jpg` }).where(eq(photo.id, p!.id));

    const res = await t.app.inject({ method: 'GET', url: `/public/reports/${publicId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual([...PUBLIC_KEYS, 'photos'].sort());
    expect(body.photos).toEqual([{ url: `https://photos.test/public/blurred/${p!.id}.jpg` }]);
    expect(JSON.stringify(body)).not.toMatch(/originals\//);
  });

  it('answers 404 for a report that is still being processed', async () => {
    const res = await t.app.inject({ method: 'GET', url: `/public/reports/${processingId}` });
    expect(res.statusCode).toBe(404);
  });

  it('counts a report attempt where Kiezruf is not live, without an account, and not where it is live (US-44)', async () => {
    const attempt = (p: { lat: number; lon: number }) => t.app.inject({ method: 'POST', url: '/public/report-attempts', payload: p });
    const fk = await countSignals('Friedrichshain-Kreuzberg');
    const nk = await countSignals('Neukölln');
    expect((await attempt(KOTTBUSSER_TOR)).json()).toMatchObject({ live: false, tenant: { name: 'Friedrichshain-Kreuzberg' } });
    expect((await attempt(KARL_MARX_STR_100)).json()).toMatchObject({ live: true, tenant: { name: 'Neukölln' } });
    expect(await countSignals('Friedrichshain-Kreuzberg')).toBe(fk + 1);
    expect(await countSignals('Neukölln')).toBe(nk);
    // The read-only lookup counts nothing.
    await t.app.inject({ method: 'GET', url: `/public/route?lat=${KOTTBUSSER_TOR.lat}&lon=${KOTTBUSSER_TOR.lon}` });
    expect(await countSignals('Friedrichshain-Kreuzberg')).toBe(fk + 1);
  });

  it('names the receiving office for a point, or says the area is not live (US-41, US-44)', async () => {
    const at = (p: { lat: number; lon: number }) => t.app.inject({ method: 'GET', url: `/public/route?lat=${p.lat}&lon=${p.lon}` });
    expect((await at(KARL_MARX_STR_100)).json()).toEqual({ live: true, tenant: { name: 'Neukölln', office: 'Bezirksamt Neukölln', status: 'pilot' } });
    expect((await at(KOTTBUSSER_TOR)).json()).toMatchObject({ live: false, tenant: { name: 'Friedrichshain-Kreuzberg', status: 'not_live' } });
    expect((await at(MARIENPLATZ_MUNICH)).json()).toEqual({ live: false, tenant: null });
  });
});

describe('Me too (US-18, D-03, D-05)', () => {
  let publicId: string;
  let processingId: string;
  let anna: string;
  let ben: string;
  beforeAll(async () => {
    anna = await signIn(t, newEmail());
    ben = await signIn(t, newEmail());
    publicId = (await post(anna, { category: 'bike_lane' })).json().publicId;
    processingId = (await post(anna, { category: 'bike_lane' })).json().publicId;
    await publish(publicId);
  });

  const vote = (token: string, id: string, at = north(KARL_MARX_STR_100, 100), accuracyM = 15) =>
    t.app.inject({ method: 'PUT', url: `/reports/${id}/me-too`, headers: auth(token), payload: { ...at, accuracyM } });
  const unvote = (token: string, id: string) => t.app.inject({ method: 'DELETE', url: `/reports/${id}/me-too`, headers: auth(token) });

  it('counts one vote per account, and voting again changes nothing', async () => {
    expect((await vote(anna, publicId)).json()).toEqual({ voted: true, meTooCount: 1 });
    expect((await vote(anna, publicId)).json()).toEqual({ voted: true, meTooCount: 1 });
    expect((await vote(ben, publicId)).json()).toEqual({ voted: true, meTooCount: 2 });
  });

  it('shows the count publicly', async () => {
    const res = await t.app.inject({ method: 'GET', url: `/public/reports/${publicId}` });
    expect(res.json().meTooCount).toBe(2);
  });

  it('can be undone, and undoing twice changes nothing', async () => {
    expect((await unvote(ben, publicId)).json()).toEqual({ voted: false, meTooCount: 1 });
    expect((await unvote(ben, publicId)).json()).toEqual({ voted: false, meTooCount: 1 });
  });

  it('needs the citizen within 150 m of the report, with good accuracy', async () => {
    expect((await vote(ben, publicId, north(KARL_MARX_STR_100, 300))).json()).toEqual({ error: 'not_on_site' });
    expect((await vote(ben, publicId, KARL_MARX_STR_100, 101)).json()).toEqual({ error: 'accuracy_too_low' });
  });

  it('is not possible on a report that is not public', async () => {
    expect((await vote(ben, processingId)).statusCode).toBe(404);
  });

  it('needs a session', async () => {
    const res = await t.app.inject({ method: 'PUT', url: `/reports/${publicId}/me-too`, payload: { ...KARL_MARX_STR_100, accuracyM: 10 } });
    expect(res.statusCode).toBe(401);
  });
});

describe('row-level security for citizens (ENG-08)', () => {
  let annaId: string;
  let benId: string;
  let annaReport: string;
  beforeAll(async () => {
    const annaEmail = newEmail();
    const benEmail = newEmail();
    const anna = await signIn(t, annaEmail);
    await signIn(t, benEmail);
    annaReport = (await post(anna)).json().publicId;
    await publish(annaReport);
    const ids = await db.select({ id: account.id, email: account.email }).from(account);
    annaId = ids.find((a) => a.email === annaEmail)!.id;
    benId = ids.find((a) => a.email === benEmail)!.id;
  });

  it('a citizen reads only their own rows from report', async () => {
    const asBen = await withCitizenSession(db, benId, (tx) => tx.select({ id: report.publicId }).from(report));
    expect(asBen).toEqual([]);
    const asAnna = await withCitizenSession(db, annaId, (tx) => tx.select({ id: report.publicId }).from(report));
    expect(asAnna.map((r) => r.id)).toEqual([annaReport]);
  });

  it('a citizen cannot post as someone else or skip processing', async () => {
    const [nk] = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.path, 'de.be.bec.nk'));
    const values = (createdBy: string, status: 'processing' | 'open') => ({
      publicId: `BE-NK-2099-${status === 'open' ? '0001' : '0002'}`,
      tenantId: nk!.id,
      category: 'pothole',
      status,
      location: sql`ST_SetSRID(ST_MakePoint(13.4365, 52.4795), 4326)::geography`,
      captureLocation: sql`ST_SetSRID(ST_MakePoint(13.4365, 52.4795), 4326)::geography`,
      captureAt: new Date(),
      createdBy,
    });
    await expectRlsError(withCitizenSession(db, benId, (tx) => tx.insert(report).values(values(annaId, 'processing'))));
    await expectRlsError(withCitizenSession(db, benId, (tx) => tx.insert(report).values(values(benId, 'open'))));
  });

  it('a citizen cannot vote for someone else or read other votes', async () => {
    const [r] = await db.select({ id: report.id }).from(report).where(eq(report.publicId, annaReport));
    await expectRlsError(
      withCitizenSession(db, benId, (tx) => tx.insert(reaction).values({ reportId: r!.id, accountId: annaId, kind: 'me_too' })),
    );
    await withCitizenSession(db, annaId, (tx) => tx.insert(reaction).values({ reportId: r!.id, accountId: annaId, kind: 'me_too' }));
    expect(await withCitizenSession(db, benId, (tx) => tx.select().from(reaction))).toEqual([]);
  });

  it('a citizen cannot add a co-reporter or danger reaction directly', async () => {
    const [r] = await db.select({ id: report.id }).from(report).where(eq(report.publicId, annaReport));
    await expectRlsError(
      withCitizenSession(db, benId, (tx) => tx.insert(reaction).values({ reportId: r!.id, accountId: benId, kind: 'danger' })),
    );
  });

  it('a citizen cannot read sign-in data or other accounts', async () => {
    const accounts = await withCitizenSession(db, benId, (tx) => tx.select({ id: account.id }).from(account));
    expect(accounts).toEqual([{ id: benId }]);
    await expectDbError(withCitizenSession(db, benId, (tx) => tx.select().from(loginCode)), /permission denied/);
    await expectDbError(withCitizenSession(db, benId, (tx) => tx.select().from(session)), /permission denied/);
  });

  it('vote rows follow the scope of their report (US-42)', async () => {
    const [caseWorker] = await db.insert(account).values({ email: newEmail() }).returning({ id: account.id });
    const [sp] = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.path, 'de.be.bec.sp'));
    await db.insert(staffRole).values({ accountId: caseWorker!.id, tenantId: sp!.id, role: 'case_worker' });
    const spandau = await loadStaffScope(db, caseWorker!.id);
    expect(await withStaffScope(db, spandau, (tx) => tx.select().from(reaction))).toEqual([]);

    const [nkCaseWorker] = await db.insert(account).values({ email: newEmail() }).returning({ id: account.id });
    const [nk] = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.path, 'de.be.bec.nk'));
    await db.insert(staffRole).values({ accountId: nkCaseWorker!.id, tenantId: nk!.id, role: 'case_worker' });
    const neukoelln = await loadStaffScope(db, nkCaseWorker!.id);
    expect((await withStaffScope(db, neukoelln, (tx) => tx.select().from(reaction))).length).toBeGreaterThan(0);
  });
});

async function expectDbError(query: PromiseLike<unknown>, message: RegExp) {
  const error = await Promise.resolve(query).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error, 'expected the query to fail').toBeInstanceOf(Error);
  const cause = (error as Error).cause;
  expect(cause instanceof Error ? cause.message : (error as Error).message).toMatch(message);
}

const expectRlsError = (query: PromiseLike<unknown>) => expectDbError(query, /row-level security/);
