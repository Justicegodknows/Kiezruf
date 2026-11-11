// Tenant scope for staff queries (US-42). Every staff query goes through withStaffScope, which switches
// the transaction to the kiezruf_staff database role and tells row-level security what the caller may
// read and change. The policies are in drizzle/0002_tenant_isolation.sql.
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db, Tx } from './client.js';
import { account, staffRole, tenant, type StaffRoleKind } from './schema.js';

export interface StaffScope {
  /** Tenant paths whose subtrees the caller may read: one per role grant. */
  readPaths: string[];
  /** Tenant paths whose own reports the caller may change: grants with a role other than viewer. */
  writePaths: string[];
}

export interface StaffGrant {
  path: string;
  role: StaffRoleKind;
}

/** Roles inherit down the tree for reading. Changing a report needs a non-viewer role at the tenant that owns it. */
export function scopeFromGrants(grants: readonly StaffGrant[]): StaffScope {
  return {
    readPaths: [...new Set(grants.map((g) => g.path))],
    writePaths: [...new Set(grants.filter((g) => g.role !== 'viewer').map((g) => g.path))],
  };
}

/** Resolves an account's role grants to a scope, once per request. Deleted accounts have no scope. */
export async function loadStaffScope(db: Db, accountId: string): Promise<StaffScope> {
  const grants = await db
    .select({ path: tenant.path, role: staffRole.role })
    .from(staffRole)
    .innerJoin(tenant, eq(tenant.id, staffRole.tenantId))
    .innerJoin(account, eq(account.id, staffRole.accountId))
    .where(and(eq(staffRole.accountId, accountId), isNull(account.deletedAt)));
  return scopeFromGrants(grants);
}

const LTREE_PATH = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/;

/** Formats tenant paths as a PostgreSQL ltree[] literal, e.g. {de.be.bec.nk,de.be.bec.sp}. */
export function toLtreeArrayLiteral(paths: readonly string[]): string {
  for (const path of paths) {
    if (!LTREE_PATH.test(path)) throw new Error(`Invalid tenant path: ${JSON.stringify(path)}`);
  }
  return `{${paths.join(',')}}`;
}

/** Runs `fn` in a transaction that sees only the rows inside `scope`. An empty scope sees no rows. */
export function withStaffScope<T>(db: Db, scope: StaffScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const read = toLtreeArrayLiteral(scope.readPaths);
  const write = toLtreeArrayLiteral(scope.writePaths);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE kiezruf_staff`);
    await tx.execute(
      sql`SELECT set_config('app.scope_paths', ${read}, true), set_config('app.write_paths', ${write}, true)`,
    );
    return fn(tx);
  });
}

/** Runs `fn` in a transaction limited to what any citizen may read: the tenant tree and the public_report view. */
export function withCitizenAccess<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE kiezruf_citizen`);
    return fn(tx);
  });
}
