// forward-by-email.feature (US-45) and delete-account.feature (US-34)
import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { parseReportId } from '@kiezruf/shared';
import { sql } from 'drizzle-orm';
import { signIn, uploadPhotos } from '../../test/support/app.js';
import { PENDING, SCENARIO_NOW, type KiezrufWorld } from '../support/world.js';

// --- forward by email ---
Given('{string} is a saved external contact', function (_contact: string) {
  return PENDING;
});

Given('a forward link was created {int} days ago', function (_days: number) {
  return PENDING;
});

When('I forward {string} to {string} with a public note', function (_id: string, _contact: string) {
  return PENDING;
});

When('someone opens the link', function () {
  return PENDING;
});

Then('one email is sent with the blurred photo, the location and a link', function () {
  return PENDING;
});

Then('the link opens the report without a login', function () {
  return PENDING;
});

Then('every follower is notified', function () {
  return PENDING;
});

Then('they see {string}', function (_message: string) {
  return PENDING;
});

// --- delete account ---
// The apps show "a neighbour" for every report and comment: the API never returns an author (US-24, US-34).
const ANONYMOUS_AUTHOR = 'a neighbour';
const AUTHOR_FIELDS = ['author', 'createdBy', 'created_by', 'accountId', 'account_id', 'email'];
let accountCounter = 0;

Given('I posted the report {string} and two comments', async function (this: KiezrufWorld, publicId: string) {
  const parts = parseReportId(publicId);
  assert.ok(parts, `Not a report ID: ${publicId}`);
  this.email = `feature-delete-${++accountCounter}@example.org`;
  this.devices = [await signIn(this.t, this.email), await signIn(this.t, this.email)];
  const [token] = this.devices;

  // Make the next number in that tenant and year the one the scenario names.
  await this.db.execute(sql`
    INSERT INTO report_sequence (tenant_id, year, last_value)
    SELECT id, ${parts.year}, ${parts.sequence - 1} FROM tenant WHERE code = ${parts.tenant} AND type = 'bezirk'
    ON CONFLICT (tenant_id, year) DO UPDATE SET last_value = EXCLUDED.last_value`);
  const res = await this.t.app.inject({
    method: 'POST',
    url: '/reports',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      category: 'pothole',
      capture: { lat: 52.4795, lon: 13.4365, accuracyM: 10, capturedAt: SCENARIO_NOW.toISOString() },
      photoKeys: await uploadPhotos(this.t, token!),
    },
  });
  assert.equal(res.json().publicId, publicId, res.body);
  this.publicId = publicId;
  await this.db.execute(sql`UPDATE report SET status = 'open' WHERE public_id = ${publicId}`);
  for (const body of ['Still there this morning.', 'Someone nearly fell in.']) {
    const c = await this.t.app.inject({ method: 'POST', url: `/reports/${publicId}/comments`, headers: { authorization: `Bearer ${token}` }, payload: { body } });
    assert.equal(c.statusCode, 201, c.body);
  }
});

When('I delete my account', async function (this: KiezrufWorld) {
  const res = await this.t.app.inject({ method: 'DELETE', url: '/me', headers: { authorization: `Bearer ${this.devices[0]}` } });
  assert.equal(res.statusCode, 204, res.body);
});

Then('I am signed out on every device', async function (this: KiezrufWorld) {
  assert.ok(this.devices.length >= 2);
  for (const token of this.devices) {
    const res = await this.t.app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } });
    assert.equal(res.statusCode, 401);
  }
});

Then('the report and the comments show the author {string}', async function (this: KiezrufWorld, author: string) {
  assert.equal(author, ANONYMOUS_AUTHOR);
  const detail = (await this.t.app.inject({ method: 'GET', url: `/public/reports/${this.publicId}` })).json();
  const comments = (await this.t.app.inject({ method: 'GET', url: `/public/reports/${this.publicId}/comments` })).json().comments;
  assert.equal(comments.length, 2);
  for (const item of [detail, ...comments]) {
    for (const field of AUTHOR_FIELDS) assert.ok(!(field in item), `public payload carries "${field}"`);
  }
  const [row] = await this.db.execute<{ created_by: string | null }>(sql`SELECT created_by FROM report WHERE public_id = ${this.publicId!}`);
  assert.equal(row!.created_by, null);
});

Then('my email or phone number is removed within {int} days', async function (this: KiezrufWorld, days: number) {
  assert.ok(days >= 0);
  // Removed at once, which is within any allowed period.
  const rows = await this.db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM account WHERE lower(email) = ${this.email!} OR phone IS NOT NULL AND deleted_at IS NOT NULL`);
  assert.equal(rows[0]!.n, 0);
});
