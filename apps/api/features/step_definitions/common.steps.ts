// Steps shared by several features. Cucumber checks arity, so every step function declares one parameter per placeholder.
import assert from 'node:assert/strict';
import { Given, Then } from '@cucumber/cucumber';
import { sql } from 'drizzle-orm';
import { signIn } from '../../test/support/app.js';
import { signInNewStaff, statusValue, tenantPath } from '../support/helpers.js';
import { PENDING, type KiezrufWorld } from '../support/world.js';

const TENANT_STATUS: Record<string, string> = { pilot: 'pilot', live: 'live', 'not live': 'not_live', grouping: 'grouping' };

// Display text from the product plan → the API error code the apps translate into that text.
// The text itself is checked in the web and mobile suites, which render it.
const MESSAGE_CODES: Record<string, string> = {
  'Kiezruf is not live here yet': 'not_live',
  'This link has expired': 'link_expired',
};

let citizenCounter = 0;

Given('the tenant {string} has status {string}', async function (this: KiezrufWorld, tenant: string, status: string) {
  const value = TENANT_STATUS[status];
  assert.ok(value, `Unknown tenant status "${status}"`);
  const rows = await this.db.execute(sql`
    UPDATE tenant SET status = ${value}::tenant_status
    WHERE id = (SELECT id FROM tenant WHERE name = ${tenant} ORDER BY nlevel(path) DESC LIMIT 1)
    RETURNING id`);
  assert.equal(rows.length, 1, `No tenant named "${tenant}"`);
});

Given('I am signed in as a citizen', async function (this: KiezrufWorld) {
  this.token = await signIn(this.t, `feature-citizen-${++citizenCounter}@example.org`);
});

Given('I am a case worker assigned to {string}', async function (this: KiezrufWorld, tenant: string) {
  this.staffToken = await signInNewStaff(this, await tenantPath(this, tenant), 'case_worker');
});

// "Berlin" here is the Land: a viewer at Land level (tenant-isolation.feature).
Given('I am a viewer assigned to {string}', async function (this: KiezrufWorld, tenant: string) {
  this.staffToken = await signInNewStaff(this, await tenantPath(this, tenant, 'shallowest'), 'viewer');
});

function seesMessage(this: KiezrufWorld, message: string) {
  const code = MESSAGE_CODES[message];
  if (!code) return PENDING;
  assert.equal(this.lastResponse?.body.error, code);
  return undefined;
}

Then('I see {string}', seesMessage);
// Someone without an account, e.g. the authority that opens a forward link (forward-by-email.feature).
Then('they see {string}', seesMessage);

Then('the report status is {string}', async function (this: KiezrufWorld, status: string) {
  const id = this.reportIds.at(-1);
  assert.ok(id, 'No report in this scenario');
  const [row] = await this.db.execute<{ status: string }>(sql`SELECT status FROM report WHERE public_id = ${id}`);
  assert.equal(row?.status, statusValue(status));
});
