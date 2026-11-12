// routing.feature (US-03, US-41, US-44) and blur.feature (US-31, US-16)
import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { categoryByName } from '@kiezruf/shared';
import { sql } from 'drizzle-orm';
import { uploadPhotos } from '../../test/support/app.js';
import sharp from 'sharp';
import { MAX_BLUR_ATTEMPTS, processPendingPhotos } from '../../src/photos/process.js';
import { uploadPhotoBytes } from '../../test/support/app.js';
import { FACE, PLATE, regionDetail, testPhoto } from '../../test/support/fakes.js';
import { citizenToken, signInNewStaff } from '../support/helpers.js';
import { SCENARIO_NOW, type KiezrufWorld } from '../support/world.js';

// --- routing ---
// Named places in the scenarios.
const PLACES: Record<string, { lat: number; lon: number }> = {
  'Karl-Marx-Straße 100': { lat: 52.4795, lon: 13.4365 },
};

async function signalCounts(world: KiezrufWorld): Promise<Map<string, number>> {
  const rows = await world.db.execute<{ name: string | null; n: number }>(sql`
    SELECT t.name, count(*)::int AS n FROM demand_signal d LEFT JOIN tenant t ON t.id = d.tenant_id GROUP BY t.name`);
  return new Map(rows.map((r) => [r.name ?? '(none)', r.n]));
}

async function reportCount(world: KiezrufWorld): Promise<number> {
  const [row] = await world.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM report`);
  return row!.n;
}

async function postReport(world: KiezrufWorld, categoryName: string) {
  const category = categoryByName(categoryName);
  assert.ok(category, `Unknown category "${categoryName}"`);
  assert.ok(world.token, 'Sign in first');
  world.before = { reports: await reportCount(world), signals: await signalCounts(world) };
  const photoKeys = await uploadPhotos(world.t, world.token);
  const res = await world.t.app.inject({
    method: 'POST',
    url: '/reports',
    headers: { authorization: `Bearer ${world.token}` },
    payload: {
      category: category.key,
      capture: { ...world.capture, capturedAt: SCENARIO_NOW.toISOString() },
      photoKeys,
    },
  });
  world.lastResponse = { statusCode: res.statusCode, body: res.json() };
}

Given('my capture location is {word} {int} with {int} m accuracy', function (this: KiezrufWorld, street: string, number: number, metres: number) {
  const place = PLACES[`${street} ${number}`];
  assert.ok(place, `Unknown place "${street} ${number}"`);
  this.capture = { ...place, accuracyM: metres };
});

Given('my capture location is inside {string}', async function (this: KiezrufWorld, tenant: string) {
  const [row] = await this.db.execute<{ lat: number; lon: number }>(sql`
    SELECT ST_Y(p) AS lat, ST_X(p) AS lon FROM (
      SELECT ST_PointOnSurface(boundary) AS p FROM tenant WHERE name = ${tenant} ORDER BY nlevel(path) DESC LIMIT 1) s`);
  assert.ok(row, `No tenant named "${tenant}"`);
  this.capture = { lat: row.lat, lon: row.lon, accuracyM: 20 };
});

Given('my capture location has {int} m accuracy', function (this: KiezrufWorld, metres: number) {
  this.capture = { ...this.capture, accuracyM: metres };
});

When('I post a report in category {string}', async function (this: KiezrufWorld, category: string) {
  await postReport(this, category);
});

When('I try to post a report', async function (this: KiezrufWorld) {
  await postReport(this, 'Pothole');
});

Then('the report is assigned to tenant {string}', async function (this: KiezrufWorld, tenant: string) {
  assert.equal(this.lastResponse?.statusCode, 201, JSON.stringify(this.lastResponse?.body));
  const [row] = await this.db.execute<{ name: string }>(sql`
    SELECT t.name FROM report r JOIN tenant t ON t.id = r.tenant_id WHERE r.public_id = ${this.lastResponse!.body.publicId as string}`);
  assert.equal(row?.name, tenant);
});

Then('its ID matches {string}', function (this: KiezrufWorld, pattern: string) {
  assert.match(this.lastResponse?.body.publicId as string, new RegExp(`^${pattern}$`));
});

// The review screen asks GET /public/route for the capture point before posting (US-41).
Then('the review screen named {string} as the receiving office', async function (this: KiezrufWorld, office: string) {
  const res = await this.t.app.inject({ method: 'GET', url: `/public/route?lat=${this.capture.lat}&lon=${this.capture.lon}` });
  assert.equal(res.json().tenant?.office, office);
});

Then('no report is created', async function (this: KiezrufWorld) {
  assert.equal(await reportCount(this), this.before.reports);
});

Then('one demand signal is recorded for {string}', async function (this: KiezrufWorld, tenant: string) {
  const after = await signalCounts(this);
  assert.equal((after.get(tenant) ?? 0) - (this.before.signals.get(tenant) ?? 0), 1);
});

Then('posting is {word}', function (this: KiezrufWorld, result: string) {
  if (result === 'allowed') assert.equal(this.lastResponse?.statusCode, 201, JSON.stringify(this.lastResponse?.body));
  else if (result === 'blocked') assert.deepEqual(this.lastResponse?.body, { error: 'accuracy_too_low' });
  else assert.fail(`Unknown result "${result}"`);
});

// --- blur ---
async function postWithPhoto(world: KiezrufWorld) {
  const token = await citizenToken(world);
  const key = await uploadPhotoBytes(world.t, token, await testPhoto());
  const res = await world.t.app.inject({
    method: 'POST',
    url: '/reports',
    headers: { authorization: `Bearer ${token}` },
    payload: { category: 'pothole', capture: { ...PLACES['Karl-Marx-Straße 100']!, accuracyM: 10, capturedAt: SCENARIO_NOW.toISOString() }, photoKeys: [key] },
  });
  assert.equal(res.statusCode, 201, res.body);
  world.reportIds.push(res.json().publicId);
}

const runPipeline = (world: KiezrufWorld) => processPendingPhotos({ db: world.db, storage: world.t.storage, detector: world.detector, ai: world.ai });

async function publicCopy(world: KiezrufWorld): Promise<Buffer> {
  const [row] = await world.db.execute<{ public_key: string }>(sql`
    SELECT p.public_key FROM photo p JOIN report r ON r.id = p.report_id WHERE r.public_id = ${world.reportIds.at(-1)!}`);
  assert.ok(row?.public_key, 'The photo has no public copy');
  const copy = world.t.storage.publicObjects.get(row.public_key);
  assert.ok(copy, 'The public copy was not stored');
  return copy;
}

Given('I posted a report with one photo showing a face and a licence plate', async function (this: KiezrufWorld) {
  this.detector.regions = [FACE, PLATE];
  await postWithPhoto(this);
});

Given('the blur service fails {int} times for my photo', async function (this: KiezrufWorld, times: number) {
  await postWithPhoto(this);
  this.detector.failures = times;
});

When('photo processing completes', async function (this: KiezrufWorld) {
  await runPipeline(this);
});

When('photo processing gives up', async function (this: KiezrufWorld) {
  for (let i = 0; i < MAX_BLUR_ATTEMPTS; i++) await runPipeline(this);
});

Then('the public photo has the face and the plate blurred', async function (this: KiezrufWorld) {
  const copy = await publicCopy(this);
  // A readable face or plate has fine detail; after blurring the region is nearly flat.
  for (const region of [FACE, PLATE]) assert.ok((await regionDetail(copy, region)) < 5, 'Detail survived the blur');
});

Then('the public photo has no EXIF metadata', async function (this: KiezrufWorld) {
  assert.equal((await sharp(await publicCopy(this)).metadata()).exif, undefined);
});

Then('the report is visible on the map', async function (this: KiezrufWorld) {
  const { lat, lon } = PLACES['Karl-Marx-Straße 100']!;
  const res = await this.t.app.inject({ method: 'GET', url: `/public/reports?lat=${lat}&lon=${lon}&limit=200` });
  assert.ok(res.json().reports.some((r: { publicId: string }) => r.publicId === this.reportIds.at(-1)));
});

Then('the report is not visible to citizens', async function (this: KiezrufWorld) {
  const res = await this.t.app.inject({ method: 'GET', url: `/public/reports/${this.reportIds.at(-1)}` });
  assert.equal(res.statusCode, 404);
});

Then('the report appears in the moderation queue as {string}', async function (this: KiezrufWorld, reason: string) {
  this.staffToken = await signInNewStaff(this, 'de.be.bec.nk', 'case_worker');
  const res = await this.t.app.inject({ method: 'GET', url: '/staff/moderation', headers: { authorization: `Bearer ${this.staffToken}` } });
  const held = res.json().held.find((h: { publicId: string }) => h.publicId === this.reportIds.at(-1));
  assert.deepEqual(held?.reason, reason.replace(/ /g, '_'));
});

Then('the original photo URL is not reachable without a staff session', async function (this: KiezrufWorld) {
  const id = this.reportIds.at(-1)!;
  const [row] = await this.db.execute<{ original_key: string; photo_id: string }>(sql`
    SELECT p.original_key, p.id AS photo_id FROM photo p JOIN report r ON r.id = p.report_id WHERE r.public_id = ${id}`);
  // Nothing public carries it: no public copy, no citizen payload, and the staff detail needs a staff session.
  assert.equal(this.t.storage.publicObjects.has(`public/${row!.photo_id}.jpg`), false);
  const anonymous = await this.t.app.inject({ method: 'GET', url: `/staff/reports/${id}` });
  assert.equal(anonymous.statusCode, 401);
  const citizen = await this.t.app.inject({ method: 'GET', url: `/staff/reports/${id}`, headers: { authorization: `Bearer ${await citizenToken(this)}` } });
  assert.equal(citizen.statusCode, 401);
  const staff = await this.t.app.inject({ method: 'GET', url: `/staff/reports/${id}`, headers: { authorization: `Bearer ${this.staffToken}` } });
  assert.match(staff.json().photos[0].originalUrl, /signature=download/);
  assert.ok(!JSON.stringify((await this.t.app.inject({ method: 'GET', url: `/public/reports/${id}` })).json()).includes(row!.original_key));
});
