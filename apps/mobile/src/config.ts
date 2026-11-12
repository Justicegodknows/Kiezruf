import Constants from 'expo-constants';

// EXPO_PUBLIC_* values are inlined at build time, so they must be read with the full static name.
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '');

/**
 * Supabase Auth (ENG-22, README "Hosting and sign-in"). The URL and the publishable (anon) key are public by design;
 * they are not secrets. Defaults point at a local `supabase start` (port 54321); see .env.example.
 */
export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://localhost:54321').replace(/\/+$/, '');
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

/** MapLibre style URL (ENG-13). Development uses the public OpenFreeMap style; the production host is open (E-08). */
export const MAP_STYLE_URL = process.env.EXPO_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';

/** Where the map starts before the citizen asks for their own position: Rathaus Neukölln (pilot tenant). */
export const DEFAULT_CENTER = { lat: 52.4811, lon: 13.4353 } as const;

/** Radius of the nearby list and map query in metres. */
export const NEARBY_RADIUS_M = 2_000;

/** Long edge of an uploaded photo after resizing, in pixels. */
export const UPLOAD_MAX_EDGE_PX = 2048;

/** The EAS project ID for Expo push tokens, or undefined while no EAS project is set up. */
export function easProjectId(): string | undefined {
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined)?.eas?.projectId;
  const id = fromExtra ?? Constants.easConfig?.projectId;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}
