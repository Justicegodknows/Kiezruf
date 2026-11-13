// Tenant tree seed for the pilot: Deutschland → Berlin (Land) → Berlin (Stadt) → the 12 Bezirke.
// Statuses follow the product plan's tenant tree: Neukölln and Spandau are pilot, the other Bezirke not live.
// Safe to run again: nodes are matched by path and updated in place.
//
// Boundaries: berlin-bezirke.geojson holds the ALKIS Bezirk polygons published by Geoportal Berlin, taken from
// the Technologiestiftung Berlin open-data copy
// (https://tsb-opendata.s3.eu-central-1.amazonaws.com/bezirksgrenzen/bezirksgrenzen.geojson),
// with coordinates rounded to 6 decimals (about 0.1 m). The Land and Stadt boundaries are the union of the Bezirke.
// Tenants outside Berlin need the BKG VG250 import, which is not written yet (PROGRESS.md).
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import type { Db } from '../client.js';

const BEZIRKE_FILE = new URL('./berlin-bezirke.geojson', import.meta.url);

/** Berlin's Bezirk number → path label and report-ID code. */
const BEZIRKE: Record<string, { label: string; status: 'pilot' | 'not_live' }> = {
  '01': { label: 'mi', status: 'not_live' }, // Mitte
  '02': { label: 'fk', status: 'not_live' }, // Friedrichshain-Kreuzberg
  '03': { label: 'pa', status: 'not_live' }, // Pankow
  '04': { label: 'cw', status: 'not_live' }, // Charlottenburg-Wilmersdorf
  '05': { label: 'sp', status: 'pilot' }, // Spandau
  '06': { label: 'sz', status: 'not_live' }, // Steglitz-Zehlendorf
  '07': { label: 'ts', status: 'not_live' }, // Tempelhof-Schöneberg
  '08': { label: 'nk', status: 'pilot' }, // Neukölln
  '09': { label: 'tk', status: 'not_live' }, // Treptow-Köpenick
  '10': { label: 'mh', status: 'not_live' }, // Marzahn-Hellersdorf
  '11': { label: 'li', status: 'not_live' }, // Lichtenberg
  '12': { label: 'rd', status: 'not_live' }, // Reinickendorf
};

interface BezirkFeature {
  properties: { name: string; bezirk: string; key: string };
  geometry: unknown;
}

export async function seedTenants(db: Db): Promise<{ tenants: number }> {
  const { features } = JSON.parse(readFileSync(BEZIRKE_FILE, 'utf8')) as { features: BezirkFeature[] };
  if (features.length !== 12) throw new Error(`Expected 12 Bezirke, found ${features.length}`);

  await db.transaction(async (tx) => {
    // Bezirk polygons, repaired if rounding made one invalid, as MultiPolygon in WGS 84.
    const toBoundary = (geometry: unknown) =>
      sql`ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), 4326)), 3))`;
    const parentOf = (path: string) => sql`(SELECT id FROM tenant WHERE path = ${path}::ltree)`;
    const onConflict = sql`
      ON CONFLICT (path) DO UPDATE SET type = EXCLUDED.type, name = EXCLUDED.name, office = EXCLUDED.office,
        ags_key = EXCLUDED.ags_key, code = EXCLUDED.code, status = EXCLUDED.status, boundary = EXCLUDED.boundary`;

    await tx.execute(sql`
      INSERT INTO tenant (parent_id, path, type, name, code, status)
      VALUES (NULL, 'de', 'country', 'Deutschland', 'DE', 'grouping') ${onConflict}`);

    // The Bezirke need their parents first, and a live parent needs a boundary, so Berlin starts with a
    // boundary built from the file and the Bezirke follow.
    const berlinBoundary = sql`(
      SELECT ST_Multi(ST_Union(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(f->>'geometry'), 4326)), 3)))
      FROM json_array_elements(${JSON.stringify(features)}::json) AS f)`;
    await tx.execute(sql`
      INSERT INTO tenant (parent_id, path, type, name, ags_key, code, status, boundary)
      VALUES (${parentOf('de')}, 'de.be', 'land', 'Berlin', '11', 'BE', 'live', ${berlinBoundary}) ${onConflict}`);
    await tx.execute(sql`
      INSERT INTO tenant (parent_id, path, type, name, ags_key, code, status, boundary)
      VALUES (${parentOf('de.be')}, 'de.be.bec', 'kreisfreie_stadt', 'Berlin', '11000000', 'B', 'live',
              (SELECT boundary FROM tenant WHERE path = 'de.be'))
      ${onConflict}`);

    for (const feature of features) {
      const { name, bezirk, key } = feature.properties;
      const node = BEZIRKE[bezirk];
      if (!node) throw new Error(`Unknown Bezirk number ${bezirk} (${name})`);
      await tx.execute(sql`
        INSERT INTO tenant (parent_id, path, type, name, office, ags_key, code, status, boundary)
        VALUES (${parentOf('de.be.bec')}, ${`de.be.bec.${node.label}`}::ltree, 'bezirk', ${name}, ${`Bezirksamt ${name}`},
                ${key}, ${node.label.toUpperCase()}, ${node.status}::tenant_status, ${toBoundary(feature.geometry)})
        ${onConflict}`);
    }
  });

  return { tenants: 3 + features.length };
}
