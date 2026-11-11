// Routing (US-41, US-44): which tenant receives a report captured at a point.
import { sql } from 'drizzle-orm';
import type { Db, Tx } from './client.js';
import type { TenantStatus } from './schema.js';

export interface RoutedTenant {
  id: string;
  path: string;
  name: string;
  office: string | null;
  code: string | null;
  status: TenantStatus;
}

export type RoutingResult =
  /** The deepest tenant at this point is pilot or live: it receives the report. */
  | { live: true; tenant: RoutedTenant }
  /** "Not live here yet". `tenant` is the deepest node at the point (for the demand signal), or null outside every boundary. */
  | { live: false; tenant: RoutedTenant | null };

/**
 * Finds the deepest tenant whose boundary covers the point. It receives the report only if it is pilot or
 * live. A not-live Bezirk inside a live city is therefore "not live here yet" (US-44) and does not fall
 * back to the city.
 */
export async function routeTenant(db: Db | Tx, point: { lon: number; lat: number }): Promise<RoutingResult> {
  const rows = await db.execute<RoutedTenant & Record<string, unknown>>(sql`
    SELECT id, path::text AS path, name, office, code, status
    FROM tenant
    WHERE boundary IS NOT NULL
      AND ST_Covers(boundary, ST_SetSRID(ST_MakePoint(${point.lon}, ${point.lat}), 4326))
    ORDER BY nlevel(path) DESC
    LIMIT 1`);
  const tenant = rows[0] ?? null;
  if (tenant && (tenant.status === 'pilot' || tenant.status === 'live')) return { live: true, tenant };
  return { live: false, tenant };
}
