// The database as Supabase runs it (ENG-22): Supabase's Data API (PostgREST) serves the public schema to the roles
// anon and authenticated, which get grants on every new table by default. Migration 0012 must leave them nothing.
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../src/db/client.js';
import { createMigratedDatabase } from './helpers.js';

let db: Db;

beforeAll(async () => {
  db = await createMigratedDatabase('supabase_like', {
    // What a Supabase project has before our migrations run.
    beforeMigrate: async (url) => {
      const owner = postgres(url, { max: 1, onnotice: () => {} });
      try {
        for (const role of ['anon', 'authenticated']) {
          await owner.unsafe(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`);
          await owner.unsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${role}`);
          await owner.unsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${role}`);
          await owner.unsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO ${role}`);
          await owner.unsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
        }
      } finally {
        await owner.end();
      }
    },
  });
});
afterAll(() => db?.$client.end());

describe('Supabase Data API lock-down (ENG-22)', () => {
  // PostGIS grants everyone read access to its coordinate-system reference data; it holds no personal data.
  const POSTGIS_REFERENCE = ['geography_columns', 'geometry_columns', 'spatial_ref_sys'];

  it('leaves anon and authenticated no privilege on our tables and views', async () => {
    const rows = await db.execute<{ role: string; relation: string; can_read: boolean; can_write: boolean }>(sql`
      SELECT r.rolname AS role, c.relname AS relation, has_table_privilege(r.oid, c.oid, 'SELECT') AS can_read,
             (has_table_privilege(r.oid, c.oid, 'INSERT') OR has_table_privilege(r.oid, c.oid, 'UPDATE')
              OR has_table_privilege(r.oid, c.oid, 'DELETE')) AS can_write
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, pg_roles r
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm') AND r.rolname IN ('anon', 'authenticated')`);
    const reachable = rows.filter((r) => r.can_write || (r.can_read && !POSTGIS_REFERENCE.includes(r.relation)));
    expect(reachable).toEqual([]);
    expect(rows.length).toBeGreaterThan(30);
  });

  it('leaves them none of our security-definer functions', async () => {
    const rows = await db.execute<{ fn: string }>(sql`
      SELECT p.proname AS fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace, pg_roles r
      WHERE n.nspname = 'public' AND p.prosecdef AND r.rolname = 'anon' AND has_function_privilege(r.oid, p.oid, 'EXECUTE')`);
    expect([...rows]).toEqual([]);
  });

  it('keeps that for tables created later', async () => {
    await db.execute(sql`CREATE TABLE later_table (id int)`);
    const [row] = await db.execute<{ ok: boolean }>(sql`SELECT has_table_privilege('anon', 'later_table', 'SELECT') AS ok`);
    expect(row!.ok).toBe(false);
  });
});
