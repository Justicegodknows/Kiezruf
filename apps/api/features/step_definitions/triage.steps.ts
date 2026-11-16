// tenant-isolation.feature (US-42), score-hidden.feature (US-24, US-22), spike-detection.feature (US-26, US-37)
import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { sql } from 'drizzle-orm';
import { recomputeScores } from '../../src/scoring/recompute.js';
import { reportWithId, tenantPath, uniqueEmail } from '../support/helpers.js';
import type { KiezrufWorld } from '../support/world.js';

const staff = (world: KiezrufWorld) => ({ authorization: `Bearer ${world.staffToken}` });

async function postIn(world: KiezrufWorld, tenantName: string): Promise<string> {
  const path = await tenantPath(world, tenantName);
  const [seq] = await world.db.execute<{ code: string; n: number }>(sql`
    SELECT t.code, COALESCE((SELECT max(last_value) FROM report_sequence s WHERE s.tenant_id = t.id), 0) + 1 AS n
    FROM tenant t WHERE t.path = ${path}::ltree`);
  return `BE-${seq!.code}-2026-${String(seq!.n).padStart(4, '0')}`;
}

// --- tenant isolation ---
Given('there are open reports in {string} and {string}', async function (this: KiezrufWorld, a: string, b: string) {
  for (const name of [a, b]) {
    const id = await postIn(this, name);
    await reportWithId(this, id);
    this.reportIds.push(id);
  }
});

When('I open the priority queue', async function (this: KiezrufWorld) {
  const res = await this.t.app.inject({ method: 'GET', url: '/staff/reports?status=all&limit=200', headers: staff(this) });
  this.lastResponse = { statusCode: res.statusCode, body: res.json() };
});

When('I request the Spandau report {string} by its ID', async function (this: KiezrufWorld, publicId: string) {
  await reportWithId(this, publicId);
  const res = await this.t.app.inject({ method: 'GET', url: `/staff/reports/${publicId}`, headers: staff(this) });
  this.lastResponse = { statusCode: res.statusCode, body: res.json() };
});

type QueueRow = { publicId: string; tenant: { name: string } };
const queueRows = (world: KiezrufWorld) => (world.lastResponse?.body.reports ?? []) as QueueRow[];

Then('I see only reports with tenant {string}', function (this: KiezrufWorld, tenant: string) {
  const rows = queueRows(this);
  assert.ok(rows.length > 0, 'The queue is empty');
  assert.deepEqual([...new Set(rows.map((r) => r.tenant.name))], [tenant]);
});

Then('the response is {string}', function (this: KiezrufWorld, status: string) {
  assert.equal(this.lastResponse?.statusCode, Number(status.split(' ')[0]));
});

Then('I see reports from {string} and {string}', function (this: KiezrufWorld, a: string, b: string) {
  const tenants = new Set(queueRows(this).map((r) => r.tenant.name));
  assert.ok(tenants.has(a) && tenants.has(b), `Saw ${[...tenants].join(', ')}`);
});

Then("I cannot change any report's status", async function (this: KiezrufWorld) {
  for (const row of queueRows(this)) {
    const res = await this.t.app.inject({
      method: 'PATCH',
      url: `/staff/reports/${row.publicId}/status`,
      headers: staff(this),
      payload: { status: 'resolved' },
    });
    assert.equal(res.statusCode, 403, `${row.publicId}: ${res.body}`);
  }
});

// --- score hidden from citizens ---
Given('the report {string} has score {int} and level {string}', async function (this: KiezrufWorld, publicId: string, score: number, level: string) {
  const id = await reportWithId(this, publicId);
  await this.db.execute(sql`
    UPDATE report_score SET score = ${score}, level = ${level}, effective_level = ${level}, dirty = false WHERE report_id = ${id}`);
  this.reportIds.push(publicId);
});

When('a citizen requests the report', async function (this: KiezrufWorld) {
  const res = await this.t.app.inject({ method: 'GET', url: `/public/reports/${this.reportIds.at(-1)}` });
  assert.equal(res.statusCode, 200, res.body);
  this.lastResponse = { statusCode: res.statusCode, body: res.json() };
});

Then('the response has no {string} field', function (this: KiezrufWorld, field: string) {
  // Anywhere in the payload, not only at the top level.
  assert.ok(!JSON.stringify(this.lastResponse?.body).includes(`"${field}"`), `The response carries "${field}"`);
});

// --- spike detection ---
Given('a report receives {int} Me too votes within {int} minutes', async function (this: KiezrufWorld, votes: number, minutes: number) {
  const publicId = await postIn(this, 'Neukölln');
  await reportWithId(this, publicId);
  this.reportIds.push(publicId);
  this.spike = { votes, minutes };
});

Given('{int} of those votes come from accounts younger than {int} days', async function (this: KiezrufWorld, fresh: number, days: number) {
  const { votes, minutes } = this.spike!;
  const [r] = await this.db.execute<{ id: string }>(sql`SELECT id FROM report WHERE public_id = ${this.reportIds.at(-1)!}`);
  for (let i = 0; i < votes; i++) {
    const age = i < fresh ? 1 : days * 5;
    const [a] = await this.db.execute<{ id: string }>(sql`
      INSERT INTO account (email, created_at) VALUES (${uniqueEmail('voter')}, now() - make_interval(days => ${age})) RETURNING id`);
    // Spread over the window, the newest vote now.
    const ago = Math.round(((votes - 1 - i) * minutes) / Math.max(1, votes - 1));
    await this.db.execute(sql`
      INSERT INTO reaction (report_id, account_id, kind, created_at) VALUES (${r!.id}, ${a!.id}, 'me_too', now() - make_interval(mins => ${ago}))`);
  }
  this.spike = { votes, minutes, fresh };
});

When('the score is recomputed', async function (this: KiezrufWorld) {
  await recomputeScores(this.db);
});

async function spikeOf(world: KiezrufWorld) {
  const [row] = await world.db.execute<{ spike_state: string; half: number; me_too: number }>(sql`
    SELECT s.spike_state, (s.breakdown->>'meToo')::real AS me_too,
           (SELECT count(*)::int FROM reaction x WHERE x.report_id = r.id AND x.kind = 'me_too' AND x.weight = 0.5) AS half
    FROM report r JOIN report_score s ON s.report_id = r.id WHERE r.public_id = ${world.reportIds.at(-1)!}`);
  return row!;
}

Then('the report is flagged as {string}', async function (this: KiezrufWorld, flag: string) {
  assert.equal(flag, 'vote spike');
  assert.equal((await spikeOf(this)).spike_state, 'flagged');
});

Then('the {int} new-account votes count at half weight', async function (this: KiezrufWorld, count: number) {
  const s = await spikeOf(this);
  assert.equal(s.half, count);
  assert.equal(s.me_too, this.spike!.votes - count * 0.5);
});

Then('the report is not flagged', async function (this: KiezrufWorld) {
  const s = await spikeOf(this);
  assert.equal(s.spike_state, 'none');
  assert.equal(s.half, 0);
});
