// Database roles for API queries. Every query the API runs on behalf of a caller goes through one of these:
//   withStaffScope      staff, limited to their tenant subtree (US-42)
//   withCitizenSession  a signed-in citizen: public reads plus their own rows and writes
//   withCitizenAccess   anyone: the tenant tree and the public views
//   withAuthAccess      sign-in bookkeeping before the caller is known
// Each switches the transaction to a database role and sets what row-level security needs.
// Roles and policies: drizzle/0002_tenant_isolation.sql and drizzle/0004_citizen_access.sql.
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
  const grants = await withAuthAccess(db, (tx) =>
    tx
      .select({ path: tenant.path, role: staffRole.role })
      .from(staffRole)
      .innerJoin(tenant, eq(tenant.id, staffRole.tenantId))
      .innerJoin(account, eq(account.id, staffRole.accountId))
      .where(and(eq(staffRole.accountId, accountId), isNull(account.deletedAt))),
  );
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Runs `fn` as the signed-in citizen `accountId`: public reads, plus their own account, reports and votes. */
export function withCitizenSession<T>(db: Db, accountId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(accountId)) throw new Error('Invalid account id');
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE kiezruf_citizen`);
    await tx.execute(sql`SELECT set_config('app.account_id', ${accountId}, true)`);
    return fn(tx);
  });
}

/** Runs `fn` with access to sign-in data only: one-time codes, sessions, accounts and role grants. */
export function withAuthAccess<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE kiezruf_auth`);
    return fn(tx);
  });
}

/** Runs `fn` in a transaction limited to what any citizen may read: the tenant tree and the public views. */
export function withCitizenAccess<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE kiezruf_citizen`);
    return fn(tx);
  });
}
