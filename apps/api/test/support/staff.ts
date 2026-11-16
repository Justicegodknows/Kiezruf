// Staff accounts for tests: grant a role directly, then hold a Supabase token with a fresh TOTP check (aal2), as staff
// get after their password and their authenticator (ENG-22). Their Supabase user is an invited one (ENG-24).
import { sql } from 'drizzle-orm';
import type { Db } from '../../src/db/client.js';
import type { TestApp } from './app.js';
import { accessToken } from './tokens.js';

export async function grantRole(db: Db, email: string, path: string, role: 'platform_admin' | 'tenant_admin' | 'case_worker' | 'viewer'): Promise<string> {
  const [row] = await db.execute<{ id: string }>(sql`
    INSERT INTO account (email) VALUES (${email}) ON CONFLICT ((lower(email))) DO UPDATE SET email = account.email RETURNING id`);
  await db.execute(sql`
    INSERT INTO staff_role (account_id, tenant_id, role) SELECT ${row!.id}, id, ${role}::staff_role_kind FROM tenant WHERE path = ${path}::ltree
    ON CONFLICT DO NOTHING`);
  return row!.id;
}

export async function staffSignIn(_t: TestApp, email: string): Promise<string> {
  return accessToken({ email, mfa: true, invited: true });
}
