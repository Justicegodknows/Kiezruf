// Staff identity for the console (US-42). Staff sign in with Supabase Auth plus TOTP (ENG-22); the API checks the
// second factor on every staff request (requireStaff).
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { account } from '../db/schema.js';
import { withAuthAccess } from '../db/scope.js';

/** The caller's grants with tenant names, for GET /staff/me and the console's permission checks. */
export async function staffGrants(db: Db, accountId: string) {
  return withAuthAccess(db, async (tx) => {
    const [me] = await tx.select({ id: account.id, email: account.email }).from(account).where(eq(account.id, accountId));
    const grants = await tx.execute<{ tenantId: string; tenantName: string; path: string; role: string }>(sql`
      SELECT t.id AS "tenantId", t.name AS "tenantName", t.path::text AS path, s.role
      FROM staff_role s JOIN tenant t ON t.id = s.tenant_id
      WHERE s.account_id = ${accountId} ORDER BY t.path`);
    return { ...me!, grants: [...grants] };
  });
}
