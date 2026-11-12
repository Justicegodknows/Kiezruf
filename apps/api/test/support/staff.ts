// Staff accounts for tests: grant a role directly, then sign in through email code + TOTP like a real staff member.
import { sql } from 'drizzle-orm';
import type { Db } from '../../src/db/client.js';
import { stepAt, totpAt } from '../../src/staff/totp.js';
import type { TestApp } from './app.js';

const secrets = new Map<string, string>();
const nextStep = new Map<string, number>();

export async function grantRole(db: Db, email: string, path: string, role: 'platform_admin' | 'tenant_admin' | 'case_worker' | 'viewer'): Promise<string> {
  const [row] = await db.execute<{ id: string }>(sql`
    INSERT INTO account (email) VALUES (${email}) ON CONFLICT ((lower(email))) DO UPDATE SET email = account.email RETURNING id`);
  await db.execute(sql`
    INSERT INTO staff_role (account_id, tenant_id, role) SELECT ${row!.id}, id, ${role}::staff_role_kind FROM tenant WHERE path = ${path}::ltree
    ON CONFLICT DO NOTHING`);
  return row!.id;
}

/** Signs in with email code + TOTP, enrolling on first use; each call uses a fresh 30-second step. */
export async function staffSignIn(t: TestApp, email: string): Promise<string> {
  await t.app.inject({ method: 'POST', url: '/auth/code', payload: { email } });
  const verify = await t.app.inject({ method: 'POST', url: '/staff/auth/verify', payload: { email, code: t.mailer.lastCodeFor(email) } });
  if (verify.statusCode !== 200) throw new Error(verify.body);
  const body = verify.json();
  if (body.next === 'enroll') secrets.set(email, body.secret);
  const step = Math.max(nextStep.get(email) ?? 0, stepAt(new Date()));
  nextStep.set(email, step + 1);
  const totp = await t.app.inject({ method: 'POST', url: '/staff/auth/totp', payload: { challenge: body.challenge, totp: totpAt(secrets.get(email)!, step) } });
  if (totp.statusCode !== 200) throw new Error(totp.body);
  return totp.json().token;
}
