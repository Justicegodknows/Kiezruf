// On-site decisions for the camera and the gallery (US-03, US-06, US-16, US-32, US-44).
// The thresholds and the capture gate come from @kiezruf/shared; the API checks the same rules again.
import { checkCapture, MAX_ACCURACY_M, MAX_PIN_ADJUST_M, MAX_VOTE_DISTANCE_M } from '@kiezruf/shared';
import type { RouteResult } from '../api/schemas';
import { distanceM, type LatLon } from '../lib/geo';

export interface Capture extends LatLon {
  accuracyM: number;
  capturedAt: Date;
}

export interface DeviceFix extends LatLon {
  /** Horizontal accuracy in metres; null when the platform did not report one. */
  accuracyM: number | null;
}

export type RejectReason =
  | 'no_metadata'
  | 'capture_too_old'
  | 'capture_in_future'
  | 'accuracy_too_low'
  | 'not_on_site'
  | 'photo_elsewhere';

export type CaptureDecision =
  | { kind: 'ok'; capture: Capture }
  /** The device fix is worse than MAX_ACCURACY_M: ask to wait or step outside (US-03). */
  | { kind: 'wait_accuracy'; accuracyM: number | null }
  | { kind: 'rejected'; reason: RejectReason };

/**
 * Further photos must show the same place as the first one. The report has one capture point, so a second
 * photo from elsewhere would misplace it. Same radius as Me too and the duplicate check (D-03).
 */
export const MAX_PHOTO_SPREAD_M = MAX_VOTE_DISTANCE_M;

function sameSpot(capture: LatLon, anchor: LatLon | undefined): boolean {
  return !anchor || distanceM(capture, anchor) <= MAX_PHOTO_SPREAD_M;
}

/** A photo from the in-app camera: the location is the fix taken at the shutter, the time is now. */
export function decideCameraCapture(fix: DeviceFix, now: Date, anchor?: LatLon): CaptureDecision {
  const gate = checkCapture({ accuracyM: fix.accuracyM, capturedAt: now }, now);
  if (!gate.ok) {
    // No accuracy at all, or a bad one: waiting for a better fix is the only fix the citizen can make.
    if (gate.reason === 'accuracy_too_low' || gate.reason === 'no_metadata') return { kind: 'wait_accuracy', accuracyM: fix.accuracyM };
    return { kind: 'rejected', reason: gate.reason };
  }
  const capture: Capture = { lat: fix.lat, lon: fix.lon, accuracyM: fix.accuracyM!, capturedAt: now };
  if (!sameSpot(capture, anchor)) return { kind: 'rejected', reason: 'photo_elsewhere' };
  return { kind: 'ok', capture };
}

// --- gallery photos (US-06: only if taken on-site within 48 h) ---------------------------------------

export interface ExifCapture {
  lat: number | null;
  lon: number | null;
  accuracyM: number | null;
  capturedAt: Date | null;
}

/**
 * A gallery photo needs EXIF location and time, and must be at most 48 h old (shared checkCapture).
 * Many cameras write no GPS accuracy. Then the photo counts as on-site only if the citizen is still there:
 * a fresh device fix within MAX_ACCURACY_M of the photo's location, whose accuracy is used for the report.
 */
export function decideGalleryPhoto(exif: ExifCapture, device: DeviceFix | null, now: Date, anchor?: LatLon): CaptureDecision {
  if (exif.lat === null || exif.lon === null || exif.capturedAt === null) return { kind: 'rejected', reason: 'no_metadata' };
  const where = { lat: exif.lat, lon: exif.lon };

  let accuracyM = exif.accuracyM;
  if (accuracyM === null) {
    if (!device) return { kind: 'rejected', reason: 'no_metadata' };
    if (device.accuracyM === null || device.accuracyM > MAX_ACCURACY_M) return { kind: 'wait_accuracy', accuracyM: device.accuracyM };
    if (distanceM(device, where) > MAX_ACCURACY_M) return { kind: 'rejected', reason: 'not_on_site' };
    accuracyM = device.accuracyM;
  }

  const gate = checkCapture({ accuracyM, capturedAt: exif.capturedAt }, now);
  if (!gate.ok) return { kind: 'rejected', reason: gate.reason };
  if (!sameSpot(where, anchor)) return { kind: 'rejected', reason: 'photo_elsewhere' };
  return { kind: 'ok', capture: { ...where, accuracyM, capturedAt: exif.capturedAt } };
}

// --- routing (US-41, US-44) ----------------------------------------------------------------------

export type RouteDecision =
  | { kind: 'live'; tenantName: string; office: string }
  | { kind: 'not_live'; tenantName: string | null };

export function decideRoute(route: RouteResult): RouteDecision {
  if (route.live && route.tenant) return { kind: 'live', tenantName: route.tenant.name, office: route.tenant.office || route.tenant.name };
  return { kind: 'not_live', tenantName: route.tenant?.name ?? null };
}

// --- pin adjustment (US-10) -------------------------------------------------------------------------

/** The pin may move up to MAX_PIN_ADJUST_M from the capture point. */
export function pinAllowed(capture: LatLon, pin: LatLon): boolean {
  return distanceM(capture, pin) <= MAX_PIN_ADJUST_M;
}

// --- EXIF parsing ---------------------------------------------------------------------------------

type Exif = Record<string, unknown>;

function rational(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  const frac = /^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(s);
  if (frac) return Number(frac[2]) === 0 ? null : Number(frac[1]) / Number(frac[2]);
  const n = Number(s);
  return s !== '' && Number.isFinite(n) ? n : null;
}

/** Decimal degrees from a number, a "d/1,m/1,s/100" string or a [d, m, s] array. */
function degrees(v: unknown): number | null {
  if (Array.isArray(v)) v = v.join(',');
  if (typeof v === 'string' && v.includes(',')) {
    const parts = v.split(',').map(rational);
    if (parts.some((p) => p === null)) return null;
    const [d = 0, m = 0, s = 0] = parts as number[];
    return d + m / 60 + s / 3600;
  }
  return rational(v);
}

function signed(value: number | null, ref: unknown, negativeRef: 'S' | 'W'): number | null {
  if (value === null) return null;
  if (typeof ref === 'string' && ref.trim().toUpperCase().startsWith(negativeRef) && value > 0) return -value;
  return value;
}

const EXIF_DATE = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

/** "2026:11:11 14:03:22" with an optional "+01:00" offset. Without offset the device's time zone applies. */
function exifDate(value: unknown, offset: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const m = EXIF_DATE.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const off = typeof offset === 'string' && /^[+-]\d{2}:\d{2}$/.test(offset.trim()) ? offset.trim() : null;
  const date = off
    ? new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${off}`)
    : new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** GPS date "2026:11:11" and time "13:03:22" (or [13, 3, 22]) are always UTC. */
function gpsDate(dateStamp: unknown, timeStamp: unknown): Date | null {
  if (typeof dateStamp !== 'string') return null;
  const dm = /^(\d{4})[:-](\d{2})[:-](\d{2})$/.exec(dateStamp.trim());
  if (!dm) return null;
  const parts = Array.isArray(timeStamp)
    ? timeStamp.map(rational)
    : typeof timeStamp === 'string'
      ? timeStamp.split(/[:,]/).map(rational)
      : [];
  if (parts.length < 3 || parts.some((p) => p === null)) return null;
  const [h, mi, s] = parts as number[];
  const date = new Date(Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), h, mi, Math.floor(s!)));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Reads location, accuracy and capture time from expo-image-picker's `exif`. Android reports flat tags
 * (GPSLatitude, DateTimeOriginal); iOS can report nested {GPS} and {Exif} dictionaries. Both are handled.
 */
export function readExif(raw: Exif | null | undefined): ExifCapture {
  if (!raw || typeof raw !== 'object') return { lat: null, lon: null, accuracyM: null, capturedAt: null };
  const gps = (raw['{GPS}'] as Exif | undefined) ?? {};
  const exif = (raw['{Exif}'] as Exif | undefined) ?? {};
  const pick = (flat: string, nested: string, dict: Exif) => raw[flat] ?? dict[nested];

  const lat = signed(degrees(pick('GPSLatitude', 'Latitude', gps)), pick('GPSLatitudeRef', 'LatitudeRef', gps), 'S');
  const lon = signed(degrees(pick('GPSLongitude', 'Longitude', gps)), pick('GPSLongitudeRef', 'LongitudeRef', gps), 'W');
  const accuracyM = rational(pick('GPSHPositioningError', 'HPositioningError', gps));
  const validLat = lat !== null && Math.abs(lat) <= 90 ? lat : null;
  const validLon = lon !== null && Math.abs(lon) <= 180 ? lon : null;
  // (0, 0) is what some apps write when they have no fix.
  const hasFix = validLat !== null && validLon !== null && !(validLat === 0 && validLon === 0);

  const capturedAt =
    exifDate(pick('DateTimeOriginal', 'DateTimeOriginal', exif), pick('OffsetTimeOriginal', 'OffsetTimeOriginal', exif)) ??
    gpsDate(pick('GPSDateStamp', 'DateStamp', gps), pick('GPSTimeStamp', 'TimeStamp', gps)) ??
    exifDate(raw.DateTime, raw.OffsetTime);

  return {
    lat: hasFix ? validLat : null,
    lon: hasFix ? validLon : null,
    accuracyM: accuracyM !== null && accuracyM >= 0 ? accuracyM : null,
    capturedAt,
  };
}
