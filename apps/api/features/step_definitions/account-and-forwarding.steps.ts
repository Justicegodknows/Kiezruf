// forward-by-email.feature (US-45) and delete-account.feature (US-34)
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { Given, Then, When } from '@cucumber/cucumber';
import { FORWARD_LINK_DAYS, parseReportId } from '@kiezruf/shared';
import { sql } from 'drizzle-orm';
import { signIn, uploadPhotos } from '../../test/support/app.js';
import { reportWithId } from '../support/helpers.js';
import { SCENARIO_NOW, type KiezrufWorld } from '../support/world.js';

// --- forward by email ---
Given('{string} is a saved external contact', async function (this: KiezrufWorld, name: string) {
  // Saved at Land level, so every Bezirk below can use it.
  await this.db.execute(sql`
    INSERT INTO external_contact (tenant_id, name, email)
    SELECT id, ${name}, 'verkehrslenkung@example.org' FROM tenant WHERE path = 'de.be'
      AND NOT EXISTS (SELECT 1 FROM external_contact WHERE name = ${name})`);
});

When('I forward {string} to {string} with a public note', async function (this: KiezrufWorld, publicId: string, contact: string) {
  const reportId = await reportWithId(this, publicId);
  // A blurred photo, as the photo pipeline (Phase 3) will leave it.
  await this.db.execute(sql`
    UPDATE photo SET blur_status = 'done', public_key = 'blurred/' || id || '.jpg' WHERE report_id = ${reportId}`);
  // A second follower besides the reporter.
  const follower = await signIn(this.t, `feature-follower-${Date.now()}@example.org`);
  await this.t.app.inject({ method: 'PUT', url: `/reports/${publicId}/follow`, headers: { authorization: `Bearer ${follower}` } });
  this.reportIds.push(publicId);

  const [c] = await this.db.execute<{ id: string }>(sql`SELECT id FROM external_contact WHERE name = ${contact}`);
  this.mailsBefore = this.t.mailer.sent.length;
  const res = await this.t.app.inject({
    method: 'POST',
    url: `/staff/reports/${publicId}/forward`,
    headers: { authorization: `Bearer ${this.staffToken}` },
    payload: { contactId: c!.id, publicNote: 'An die Verkehrslenkung Berlin weitergeleitet.' },
  });
  assert.equal(res.statusCode, 200, res.body);
});

Then('one email is sent with the blurred photo, the location and a link', function (this: KiezrufWorld) {
  const mails = this.t.mailer.sent.slice(this.mailsBefore);
  assert.equal(mails.length, 1);
  const text = mails[0]!.text;
  assert.match(text, /https:\/\/photos\.test\/public\/blurred\/[0-9a-f-]+\.jpg/);
  assert.match(text, /Ort: \d+\.\d{6}, \d+\.\d{6}/);
  const link = /https:\/\/kiezruf\.test\/forwarded\/([A-Za-z0-9_-]+)/.exec(text);
  assert.ok(link, 'No forward link in the email');
  this.forwardToken = link[1];
});

Then('the link opens the report without a login', async function (this: KiezrufWorld) {
  const res = await this.t.app.inject({ method: 'GET', url: `/forwarded/${this.forwardToken}` });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().publicId, this.reportIds.at(-1));
});

Then('every follower is notified', async function (this: KiezrufWorld) {
  const [row] = await this.db.execute<{ followers: number; notified: number }>(sql`
    SELECT (SELECT count(*)::int FROM follow f WHERE f.report_id = r.id) AS followers,
           (SELECT count(DISTINCT n.account_id)::int FROM notification n
             WHERE n.report_id = r.id AND n.kind = 'status_change' AND n.payload->>'status' = 'forwarded') AS notified
    FROM report r WHERE r.public_id = ${this.reportIds.at(-1)!}`);
  assert.ok(row!.followers >= 2);
  assert.equal(row!.notified, row!.followers);
});

Given('a forward link was created {int} days ago', async function (this: KiezrufWorld, days: number) {
  const reportId = await reportWithId(this, 'BE-SP-2026-0230');
  const token = randomBytes(32).toString('base64url');
  await this.db.execute(sql`
    WITH c AS (INSERT INTO external_contact (tenant_id, name, email)
               SELECT tenant_id, 'Old contact', 'old@example.org' FROM report WHERE id = ${reportId} RETURNING id)
    INSERT INTO forward (report_id, contact_id, token_hash, created_at, expires_at)
    SELECT ${reportId}, c.id, ${createHash('sha256').update(token).digest('hex')},
           now() - make_interval(days => ${days}), now() - make_interval(days => ${days}) + make_interval(days => ${FORWARD_LINK_DAYS})
    FROM c`);
  this.forwardToken = token;
});

When('someone opens the link', async function (this: KiezrufWorld) {
  const res = await this.t.app.inject({ method: 'GET', url: `/forwarded/${this.forwardToken}` });
  this.lastResponse = { statusCode: res.statusCode, body: res.json() };
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
