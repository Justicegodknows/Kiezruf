// routing.feature (US-03, US-41, US-44) and blur.feature (US-31, US-16)
import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { categoryByName } from '@kiezruf/shared';
import { sql } from 'drizzle-orm';
import { uploadPhotos } from '../../test/support/app.js';
import { PENDING, SCENARIO_NOW, type KiezrufWorld } from '../support/world.js';

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
Given('I posted a report with one photo showing a face and a licence plate', function () {
  return PENDING;
});

Given('the blur service fails {int} times for my photo', function (_times: number) {
  return PENDING;
});

When('photo processing completes', function () {
  return PENDING;
});

When('photo processing gives up', function () {
  return PENDING;
});

Then('the public photo has the face and the plate blurred', function () {
  return PENDING;
});

Then('the public photo has no EXIF metadata', function () {
  return PENDING;
});

Then('the report is visible on the map', function () {
  return PENDING;
});

Then('the report is not visible to citizens', function () {
  return PENDING;
});

Then('the report appears in the moderation queue as {string}', function (_reason: string) {
  return PENDING;
});

Then('the original photo URL is not reachable without a staff session', function () {
  return PENDING;
});
