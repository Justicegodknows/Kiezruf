// weekly-briefing.feature (US-53, US-56, D-13, D-17)
import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { pseudonymise } from '@kiezruf/shared';
import { sql } from 'drizzle-orm';
import { generateBriefing, sendBriefingEmails, weekStartOf } from '../../src/analysis/briefing.js';
import { recomputeScores } from '../../src/scoring/recompute.js';
import { FakeAiProvider } from '../../test/support/fakes.js';
import { reportWithId, tenantPath, uniqueEmail } from '../support/helpers.js';
import type { KiezrufWorld } from '../support/world.js';

/** Monday 16 November 2026, 06:00 in Berlin: the job's run time in these scenarios. */
const MONDAY_0600 = new Date('2026-11-16T05:00:00Z');

async function tenantId(world: KiezrufWorld, name: string): Promise<string> {
  const path = await tenantPath(world, name);
  const [row] = await world.db.execute<{ id: string }>(sql`SELECT id FROM tenant WHERE path = ${path}::ltree`);
  return row!.id;
}

/** Each scenario writes its own briefing for the week: an earlier scenario's one is removed first. */
async function freshBriefing(world: KiezrufWorld, tenant: string): Promise<string> {
  const id = await tenantId(world, tenant);
  await world.db.execute(sql`DELETE FROM briefing WHERE tenant_id = ${id} AND week_start = ${weekStartOf(MONDAY_0600)}`);
  await recomputeScores(world.db);
  world.briefingId = await generateBriefing({ db: world.db, ai: world.ai }, id, MONDAY_0600);
  return world.briefingId;
}

/** Makes sure the tenant has reports to brief on, without the cost of posting each through the API. */
async function ensureReports(world: KiezrufWorld, tenant: string, count: number) {
  const id = await tenantId(world, tenant);
  await world.db.execute(sql`
    INSERT INTO report (public_id, tenant_id, category, status, location, capture_location, capture_at, created_at)
    SELECT 'BE-NK-2026-' || lpad((7000 + g)::text, 4, '0'), ${id}, 'pothole', 'open',
           ST_SetSRID(ST_MakePoint(13.4365, 52.4795 - g * 0.0005), 4326)::geography,
           ST_SetSRID(ST_MakePoint(13.4365, 52.4795 - g * 0.0005), 4326)::geography,
           now() - make_interval(hours => g), now() - make_interval(hours => g)
    FROM generate_series(1, ${count}) AS g
    ON CONFLICT (public_id) DO NOTHING`);
}

Given(/^it is Monday (\d{2}:\d{2}) Europe\/Berlin$/, function (this: KiezrufWorld, time: string) {
  assert.equal(time, '06:00');
  this.ai = Object.assign(this.ai, { briefingAnswer: new FakeAiProvider().briefingAnswer });
});

Given('{string} has {int} reports in the last {int} days', async function (this: KiezrufWorld, tenant: string, reports: number, days: number) {
  assert.equal(tenant, 'Neukölln');
  assert.ok(reports <= days * 24, 'One report per hour at most');
  await ensureReports(this, tenant, reports);
});

Given('the model returns an item citing {string}', async function (this: KiezrufWorld, foreign: string) {
  await reportWithId(this, foreign);
  await ensureReports(this, 'Neukölln', 5);
  this.reportIds.push(foreign);
  this.ai.briefingAnswer = (input) => ({
    items: [
      { level: 'High', kind: 'Urgent', headline: 'Fremde Meldung', text: 'x', citations: [foreign] },
      { level: 'Medium', kind: 'Watch', headline: 'Eigene Meldung', text: 'y', citations: [input.reports[0]!.publicId] },
    ],
  });
});

Given('{string} has {int} tenant admin and {int} case workers', async function (this: KiezrufWorld, tenant: string, admins: number, workers: number) {
  const id = await tenantId(this, tenant);
  // Exactly these staff at the node: earlier scenarios may have added some.
  await this.db.execute(sql`DELETE FROM staff_role WHERE tenant_id = ${id}`);
  for (const [count, role] of [[admins, 'tenant_admin'], [workers, 'case_worker']] as const) {
    for (let i = 0; i < count; i++) {
      await this.db.execute(sql`
        WITH a AS (INSERT INTO account (email) VALUES (${uniqueEmail(role)}) RETURNING id)
        INSERT INTO staff_role (account_id, tenant_id, role) SELECT a.id, ${id}, ${role}::staff_role_kind FROM a`);
    }
  }
  await ensureReports(this, tenant, 5);
});

Given('a comment says {string}', async function (this: KiezrufWorld, text: string) {
  await ensureReports(this, 'Neukölln', 5);
  await recomputeScores(this.db);
  // On the report the briefing will certainly include: the top one.
  const [top] = await this.db.execute<{ id: string }>(sql`
    SELECT r.id FROM report r JOIN report_score s ON s.report_id = r.id
    WHERE r.tenant_path = 'de.be.bec.nk' AND r.status IN ('open', 'acknowledged', 'in_progress', 'forwarded') AND r.merged_into_id IS NULL
    ORDER BY s.score DESC, r.created_at DESC LIMIT 1`);
  const [author] = await this.db.execute<{ id: string }>(sql`INSERT INTO account (email) VALUES (${uniqueEmail('commenter')}) RETURNING id`);
  await this.db.execute(sql`
    INSERT INTO comment (report_id, account_id, body, created_at) VALUES (${top!.id}, ${author!.id}, ${text}, now() + interval '1 minute')`);
});

When('the briefing job runs for {string}', async function (this: KiezrufWorld, tenant: string) {
  await freshBriefing(this, tenant);
});

When('the Neukölln briefing is validated', async function (this: KiezrufWorld) {
  await freshBriefing(this, 'Neukölln');
});

When('the briefing is sent at {word}', async function (this: KiezrufWorld, time: string) {
  assert.equal(time, '07:00');
  await freshBriefing(this, 'Neukölln');
  this.mailsBefore = this.t.mailer.sent.length;
  await sendBriefingEmails({ db: this.db, mailer: this.t.mailer, webBaseUrl: 'https://kiezruf.test' }, new Date('2026-11-16T06:00:00Z'));
});

When('the briefing input is built', async function (this: KiezrufWorld) {
  await freshBriefing(this, 'Neukölln');
  this.sentText = JSON.stringify(this.ai.briefingInputs.at(-1));
});

async function items(world: KiezrufWorld) {
  return world.db.execute<{ citations: string[] }>(sql`SELECT citations FROM briefing_item WHERE briefing_id = ${world.briefingId!}`);
}

Then('the briefing has at most {int} items', async function (this: KiezrufWorld, max: number) {
  const list = await items(this);
  assert.ok(list.length > 0 && list.length <= max, `${list.length} items`);
});

Then('every item cites at least one report ID from {string}', async function (this: KiezrufWorld, tenant: string) {
  const path = await tenantPath(this, tenant);
  for (const item of await items(this)) {
    assert.ok(item.citations.length > 0);
    const [n] = await this.db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM report WHERE public_id = ANY (${`{${item.citations.join(',')}}`}::text[]) AND tenant_path <@ ${path}::ltree`);
    assert.equal(n!.n, item.citations.length);
  }
});

Then('the briefing is labelled {string}', async function (this: KiezrufWorld, label: string) {
  assert.equal(label, 'AI-written');
  const [b] = await this.db.execute<{ ai_written: boolean }>(sql`SELECT ai_written FROM briefing WHERE id = ${this.briefingId!}`);
  assert.equal(b!.ai_written, true);
});

Then('that item is not stored', async function (this: KiezrufWorld) {
  const foreign = this.reportIds.at(-1)!;
  const list = await items(this);
  assert.ok(list.length > 0, 'The valid item is missing too');
  assert.ok(list.every((i) => !i.citations.includes(foreign)));
});

Then('exactly {int} email is sent', function (this: KiezrufWorld, count: number) {
  assert.equal(this.t.mailer.sent.length - this.mailsBefore, count);
});

Then('the email contains no photos, names, emails or phone numbers', function (this: KiezrufWorld) {
  const text = this.t.mailer.sent.at(-1)!.text;
  assert.ok(!text.includes('photos.test'), 'The email links a photo');
  assert.ok(!/[\w.+-]+@[\w-]+\.\w+/.test(text), 'The email contains an email address');
  assert.equal(pseudonymise(text), text, 'The email contains a name or a phone number');
});

Then('the text sent to the provider contains neither {string} nor {string}', function (this: KiezrufWorld, a: string, b: string) {
  assert.ok(this.sentText, 'Nothing was sent');
  assert.ok(!this.sentText.includes(a) && !this.sentText.includes(b), this.sentText);
});
