// Small geometry helpers and the browser location wrapper. The location is only requested when the citizen asks
// ("near me", posting, Me too), never in the background (US-03).
import type { ErrorCode } from './errors';

export interface Point {
  lat: number;
  lon: number;
}

export interface Fix extends Point {
  accuracyM: number;
}

/** Berlin, Rotes Rathaus: the map's starting point when the citizen has not shared a location. */
export const BERLIN_CENTER: Point = { lat: 52.5186, lon: 13.4083 };

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres (haversine). Good to well under a metre at the distances used here. */
export function distanceM(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Moves a point by metres north (negative: south) and east (negative: west). */
export function offsetM(p: Point, northM: number, eastM: number): Point {
  const lat = p.lat + (northM / EARTH_RADIUS_M) * (180 / Math.PI);
  const lon = p.lon + (eastM / (EARTH_RADIUS_M * Math.cos(rad(p.lat)))) * (180 / Math.PI);
  return { lat, lon };
}

/** Keeps `p` within `maxM` of `origin`, moving it back along the line to the origin if needed (US-10). */
export function clampToRadius(origin: Point, p: Point, maxM: number): Point {
  const d = distanceM(origin, p);
  if (d <= maxM) return p;
  const f = (maxM * 0.999) / d;
  return { lat: origin.lat + (p.lat - origin.lat) * f, lon: origin.lon + (p.lon - origin.lon) * f };
}

export class LocationError extends Error {
  constructor(public readonly code: Extract<ErrorCode, 'location_denied' | 'location_unavailable' | 'location_unsupported'>) {
    super(code);
  }
}

/** One fresh, high-accuracy browser location (no cached fix). */
export function currentFix(timeoutMs = 20_000): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new LocationError('location_unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracyM: pos.coords.accuracy }),
      (err) => reject(new LocationError(err.code === 1 ? 'location_denied' : 'location_unavailable')),
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
    );
  });
}
