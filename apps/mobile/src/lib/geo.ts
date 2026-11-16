export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres (haversine). Close enough to PostGIS geography for distances under a few km. */
export function distanceM(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Translation key and value for a distance: metres under 1 km, else km with one decimal. */
export function distanceLabel(m: number): { key: 'distance.m' | 'distance.km'; value: string } {
  if (m < 1000) return { key: 'distance.m', value: String(Math.round(m / 10) * 10) };
  return { key: 'distance.km', value: (m / 1000).toFixed(1) };
}
