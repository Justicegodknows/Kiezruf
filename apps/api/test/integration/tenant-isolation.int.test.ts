// Phase 0 exit criterion: "the RLS isolation test passes" (PROGRESS.md).
// Definition of Done: every staff endpoint has a test proving no cross-tenant rows are returned.
// Runs against the real migrations and the real tenant seed (Berlin and its 12 Bezirke).
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../src/db/client.js';
import { routeTenant } from '../../src/db/routing.js';
import { account, photo, report, staffRole, tenant, type StaffRoleKind } from '../../src/db/schema.js';
import { loadStaffScope, withCitizenAccess, withStaffScope, type StaffScope } from '../../src/db/scope.js';
import { seedTenants } from '../../src/db/seed/tenants.js';
import { createMigratedDatabase } from './helpers.js';

const NK = 'de.be.bec.nk';
const SP = 'de.be.bec.sp';
const KARL_MARX_STR_100 = { lon: 13.4365, lat: 52.4795 }; // Neukölln (pilot)
const RATHAUS_SPANDAU = { lon: 13.2, lat: 52.5352 }; // Spandau (pilot)
const KOTTBUSSER_TOR = { lon: 13.418, lat: 52.499 }; // Friedrichshain-Kreuzberg (not live)
const MARIENPLATZ_MUNICH = { lon: 11.5755, lat: 48.1374 }; // no tenant boundary seeded

let db: Db;
const scopes = {} as Record<'nkCaseWorker' | 'berlinViewer' | 'berlinAdmin' | 'noGrants', StaffScope>;

async function tenantId(path: string): Promise<string> {
  const [row] = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.path, path));
  if (!row) throw new Error(`No tenant ${path}`);
  return row.id;
}

async function addStaff(email: string, grant?: { path: string; role: StaffRoleKind }): Promise<StaffScope> {
  const [row] = await db.insert(account).values({ email }).returning({ id: account.id });
  if (grant) await db.insert(staffRole).values({ accountId: row!.id, tenantId: await tenantId(grant.path), role: grant.role });
  return loadStaffScope(db, row!.id);
}

async function addReport(publicId: string, path: string, point: { lon: number; lat: number }, status: 'open' | 'processing' = 'open') {
  const location = sql`ST_SetSRID(ST_MakePoint(${point.lon}, ${point.lat}), 4326)::geography`;
  const [row] = await db
    .insert(report)
    .values({
      publicId,
      tenantId: await tenantId(path),
      category: 'pothole',
      status,
      description: 'Deep pothole in the bike lane',
      location,
      captureLocation: location,
      captureAccuracyM: 20,
      captureAt: new Date('2026-11-10T08:00:00Z'),
    })
    .returning({ id: report.id });
  await db.insert(photo).values({ reportId: row!.id, originalKey: `originals/${publicId}.jpg` });
}

/** Drizzle wraps database errors ("Failed query: …"); the PostgreSQL message is on `cause`. */
async function expectDbError(query: PromiseLike<unknown>, message: RegExp) {
  const error = await Promise.resolve(query).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error, 'expected the query to fail').toBeInstanceOf(Error);
  const cause = (error as Error).cause;
  expect(cause instanceof Error ? cause.message : (error as Error).message).toMatch(message);
}

/** Reads report statuses as the table owner, outside any scope. */
async function statusOf(publicId: string) {
  const [row] = await db.select({ status: report.status }).from(report).where(eq(report.publicId, publicId));
  return row?.status;
}

const visibleReports = (scope: StaffScope) =>
  withStaffScope(db, scope, (tx) => tx.select({ publicId: report.publicId, tenantPath: report.tenantPath }).from(report));

const acknowledge = (scope: StaffScope, publicId: string) =>
  withStaffScope(db, scope, (tx) =>
    tx.update(report).set({ status: 'acknowledged' }).where(eq(report.publicId, publicId)).returning({ publicId: report.publicId }),
  );

beforeAll(async () => {
  db = await createMigratedDatabase('tenant_isolation');
  await seedTenants(db);

  scopes.nkCaseWorker = await addStaff('caseworker@neukoelln.example', { path: NK, role: 'case_worker' });
  scopes.berlinViewer = await addStaff('viewer@berlin.example', { path: 'de.be', role: 'viewer' });
  scopes.berlinAdmin = await addStaff('admin@berlin.example', { path: 'de.be', role: 'tenant_admin' });
  scopes.noGrants = await addStaff('citizen@example.org');

  await addReport('BE-NK-2026-0118', NK, KARL_MARX_STR_100);
  await addReport('BE-NK-2026-0119', NK, KARL_MARX_STR_100);
  await addReport('BE-NK-2026-0120', NK, KARL_MARX_STR_100, 'processing');
  await addReport('BE-SP-2026-0233', SP, RATHAUS_SPANDAU);
});

afterAll(() => db?.$client.end());

describe('row-level security (US-42)', () => {
  it('a case worker scoped to Neukölln reads no Spandau rows from report', async () => {
    const rows = await visibleReports(scopes.nkCaseWorker);
    expect(rows.map((r) => r.publicId).sort()).toEqual(['BE-NK-2026-0118', 'BE-NK-2026-0119', 'BE-NK-2026-0120']);
    expect(rows.every((r) => r.tenantPath === NK)).toBe(true);
  });

  it('a case worker scoped to Neukölln cannot update a Spandau report', async () => {
    expect(await acknowledge(scopes.nkCaseWorker, 'BE-SP-2026-0233')).toEqual([]);
    expect(await statusOf('BE-SP-2026-0233')).toBe('open');
  });

  it('a case worker scoped to Neukölln can update a Neukölln report', async () => {
    expect(await acknowledge(scopes.nkCaseWorker, 'BE-NK-2026-0119')).toEqual([{ publicId: 'BE-NK-2026-0119' }]);
    expect(await statusOf('BE-NK-2026-0119')).toBe('acknowledged');
  });

  it('a viewer scoped to Berlin reads Neukölln and Spandau reports', async () => {
    const rows = await visibleReports(scopes.berlinViewer);
    expect(new Set(rows.map((r) => r.tenantPath))).toEqual(new Set([NK, SP]));
    expect(rows).toHaveLength(4);
  });

  it('a viewer scoped to Berlin cannot update any report', async () => {
    expect(await acknowledge(scopes.berlinViewer, 'BE-NK-2026-0118')).toEqual([]);
    expect(await acknowledge(scopes.berlinViewer, 'BE-SP-2026-0233')).toEqual([]);
    expect(await statusOf('BE-NK-2026-0118')).toBe('open');
    expect(await statusOf('BE-SP-2026-0233')).toBe('open');
  });

  // Product plan, tenancy rules: "Only the owner edits. Higher levels read and roll up."
  it('a tenant admin at Berlin level reads Bezirk reports but cannot update them', async () => {
    expect(await visibleReports(scopes.berlinAdmin)).toHaveLength(4);
    expect(await acknowledge(scopes.berlinAdmin, 'BE-NK-2026-0118')).toEqual([]);
    expect(await statusOf('BE-NK-2026-0118')).toBe('open');
  });

  it('a query without a tenant scope set returns no rows', async () => {
    expect(await visibleReports(scopes.noGrants)).toEqual([]);
    // The staff role without the scope settings at all, as if the scope step had been skipped.
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE kiezruf_staff`);
      return tx.select({ publicId: report.publicId }).from(report);
    });
    expect(rows).toEqual([]);
  });

  it('photo rows follow the scope of their report', async () => {
    const keys = await withStaffScope(db, scopes.nkCaseWorker, (tx) => tx.select({ key: photo.originalKey }).from(photo));
    expect(keys.map((k) => k.key).sort()).toEqual([
      'originals/BE-NK-2026-0118.jpg',
      'originals/BE-NK-2026-0119.jpg',
      'originals/BE-NK-2026-0120.jpg',
    ]);
    expect(await withStaffScope(db, scopes.noGrants, (tx) => tx.select().from(photo))).toEqual([]);
  });

  // Vote rows: citizen-api.int.test.ts. Comment rows: engagement.int.test.ts.

  it('staff cannot move a report to another tenant', async () => {
    const spandau = await tenantId(SP);
    await expectDbError(
      withStaffScope(db, scopes.nkCaseWorker, (tx) =>
        tx.update(report).set({ tenantId: spandau }).where(eq(report.publicId, 'BE-NK-2026-0118')),
      ),
      /permission denied/,
    );
  });

  it('staff cannot read accounts, and see role grants only inside their subtree', async () => {
    await expectDbError(withStaffScope(db, scopes.berlinAdmin, (tx) => tx.select().from(account)), /permission denied/);
    const grants = await withStaffScope(db, scopes.nkCaseWorker, (tx) =>
      tx.select({ path: tenant.path }).from(staffRole).innerJoin(tenant, eq(tenant.id, staffRole.tenantId)),
    );
    // The Berlin-level grants are above Neukölln, so a Neukölln case worker does not see them.
    expect(grants.map((g) => g.path)).toEqual([NK]);
  });

  it('keeps report.tenant_path equal to the path of its tenant', async () => {
    await db.update(report).set({ tenantPath: SP }).where(eq(report.publicId, 'BE-NK-2026-0118'));
    const [row] = await db.select({ tenantPath: report.tenantPath }).from(report).where(eq(report.publicId, 'BE-NK-2026-0118'));
    expect(row?.tenantPath).toBe(NK);
  });

  it('rejects a tenant whose path does not extend its parent', async () => {
    const neukoelln = await tenantId(NK);
    await expectDbError(
      db.insert(tenant).values({ parentId: neukoelln, path: 'de.be.bec.sp.kiez', type: 'bezirk', name: 'Wrong parent' }),
      /must extend parent path/,
    );
  });
});

describe('citizen access (US-24, US-31)', () => {
  it('an anonymous citizen reads no rows from the report table', async () => {
    expect(await withCitizenAccess(db, (tx) => tx.select().from(report))).toEqual([]);
  });

  it('public_report has no capture location, capture time or author', async () => {
    const rows = await withCitizenAccess(db, (tx) => tx.execute(sql`SELECT * FROM public_report LIMIT 1`));
    expect(Object.keys(rows[0]!).sort()).toEqual(
      ['category', 'created_at', 'dangerous', 'description', 'id', 'location', 'me_too_count', 'public_id', 'public_note', 'status', 'tenant_id', 'updated_at'],
    );
  });

  it('public_report shows reports from every tenant but not ones still being processed', async () => {
    const rows = await withCitizenAccess(db, (tx) => tx.execute<{ public_id: string }>(sql`SELECT public_id FROM public_report`));
    const ids = rows.map((r) => r.public_id);
    expect(ids).toContain('BE-NK-2026-0118');
    expect(ids).toContain('BE-SP-2026-0233');
    expect(ids).not.toContain('BE-NK-2026-0120');
  });
});

// Staff endpoints (US-42): staff.int.test.ts, "staff endpoints stay inside the caller subtree".

describe('tenant seed (US-40)', () => {
  it('seeds Berlin with its 12 Bezirke, Neukölln and Spandau as pilot', async () => {
    const rows = await db.select({ path: tenant.path, status: tenant.status }).from(tenant);
    expect(rows).toHaveLength(15);
    expect(rows.filter((r) => r.status === 'pilot').map((r) => r.path).sort()).toEqual([NK, SP]);
  });

  it('can be run again without adding tenants', async () => {
    await seedTenants(db);
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(tenant);
    expect(row?.count).toBe(15);
  });
});

describe('routing (US-41, US-44)', () => {
  it('assigns a report at Karl-Marx-Straße 100 to Neukölln', async () => {
    const result = await routeTenant(db, KARL_MARX_STR_100);
    expect(result.live).toBe(true);
    expect(result.tenant).toMatchObject({ name: 'Neukölln', code: 'NK', office: 'Bezirksamt Neukölln', status: 'pilot' });
  });

  // Berlin (Land) and Berlin (Stadt) are live and cover the same point; the Bezirk is deeper.
  it('uses the deepest pilot or live tenant when nodes are nested', async () => {
    expect((await routeTenant(db, KARL_MARX_STR_100)).tenant?.path).toBe(NK);
    expect((await routeTenant(db, RATHAUS_SPANDAU)).tenant?.path).toBe(SP);
  });

  it('answers "not live" inside a not-live Bezirk and does not fall back to the live city', async () => {
    const result = await routeTenant(db, KOTTBUSSER_TOR);
    expect(result.live).toBe(false);
    expect(result.tenant).toMatchObject({ name: 'Friedrichshain-Kreuzberg', status: 'not_live' });
  });

  it('answers "not live" with no tenant outside every boundary', async () => {
    expect(await routeTenant(db, MARIENPLATZ_MUNICH)).toEqual({ live: false, tenant: null });
  });

  // POST /reports in a not-live tenant (no report, one demand signal): citizen-api.int.test.ts and routing.feature.
});
