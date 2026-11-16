// Checks the database features the tenancy model depends on (engineering plan, "Data model").
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

const sql = postgres(inject('databaseUrl'), { max: 1, onnotice: () => {} });

beforeAll(async () => {
  await sql`CREATE EXTENSION IF NOT EXISTS postgis`;
  await sql`CREATE EXTENSION IF NOT EXISTS ltree`;
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
});
afterAll(() => sql.end());

describe('extensions', () => {
  it('has PostGIS', async () => {
    const [row] = await sql`SELECT extname FROM pg_extension WHERE extname = 'postgis'`;
    expect(row?.extname).toBe('postgis');
  });

  it('has ltree', async () => {
    const [row] = await sql`SELECT extname FROM pg_extension WHERE extname = 'ltree'`;
    expect(row?.extname).toBe('ltree');
  });

  // Photo similarity for duplicates (US-13). The image in infra/postgres adds pgvector to PostGIS (ENG-04).
  it('has pgvector', async () => {
    const [row] = await sql`SELECT '[1,0]'::vector <=> '[0,1]'::vector AS distance`;
    expect(row?.distance).toBe(1);
  });
});

describe('tenant subtree checks with ltree (US-42)', () => {
  it.each([
    ['de.be.bec.nk', 'de.be', true],
    ['de.be.bec.sp', 'de.be.bec', true],
    ['de.be.bec.nk', 'de.be.bec.sp', false],
    ['de.by.obb.lkm.uh', 'de.be', false],
  ])('%s is inside %s: %s', async (node, scope, inside) => {
    const [row] = await sql`SELECT ${node}::ltree <@ ${scope}::ltree AS inside`;
    expect(row?.inside).toBe(inside);
  });
});

describe('report routing with PostGIS (US-41)', () => {
  // A small square around Karl-Marx-Straße 100 stands in for the Neukölln boundary.
  const square = 'POLYGON((13.43 52.47, 13.45 52.47, 13.45 52.49, 13.43 52.49, 13.43 52.47))';

  it('matches a capture point inside the boundary', async () => {
    const [row] = await sql`
      SELECT ST_Contains(ST_GeomFromText(${square}, 4326), ST_SetSRID(ST_MakePoint(13.4365, 52.4795), 4326)) AS inside`;
    expect(row?.inside).toBe(true);
  });

  it('does not match a capture point outside the boundary', async () => {
    const [row] = await sql`
      SELECT ST_Contains(ST_GeomFromText(${square}, 4326), ST_SetSRID(ST_MakePoint(13.2, 52.53), 4326)) AS inside`;
    expect(row?.inside).toBe(false);
  });
});
