// Reads capture time and GPS from a photo file with exifr (US-04, US-06). Runs in the browser only;
// exifr is loaded on demand so it stays out of the first page load.
import type { PhotoMeta } from './photo-check';

type Dms = [number, number, number];

/** The fields of an exifr result this app reads. exifr revives EXIF dates as Dates in the browser's time zone. */
export interface RawExif {
  DateTimeOriginal?: unknown;
  CreateDate?: unknown;
  OffsetTimeOriginal?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  GPSLatitude?: unknown;
  GPSLatitudeRef?: unknown;
  GPSLongitude?: unknown;
  GPSLongitudeRef?: unknown;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function fromDms(value: unknown, ref: unknown, negative: string): number | null {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(isNum)) return null;
  const [d, m, s] = value as Dms;
  const deg = d + m / 60 + s / 3600;
  return typeof ref === 'string' && ref.toUpperCase() === negative ? -deg : deg;
}

/**
 * The capture moment. EXIF stores the camera's wall-clock time; when the file also has OffsetTimeOriginal
 * (e.g. "+01:00") that wall-clock time is converted with it instead of the browser's own time zone.
 */
export function captureDate(value: unknown, offset: unknown): Date | null {
  let date: Date | null = null;
  if (value instanceof Date) date = value;
  else if (typeof value === 'string') {
    // Unrevived EXIF string "YYYY:MM:DD HH:MM:SS".
    const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
    if (m) date = new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!);
  }
  if (!date || Number.isNaN(date.getTime())) return null;
  const off = typeof offset === 'string' ? /^([+-])(\d{2}):?(\d{2})$/.exec(offset.trim()) : null;
  if (!off) return date;
  const minutes = (off[1] === '-' ? -1 : 1) * (Number(off[2]) * 60 + Number(off[3]));
  const wallUtc = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  );
  return new Date(wallUtc - minutes * 60_000);
}

/** Turns an exifr result (or nothing, when the file has no EXIF) into the fields the on-site check needs. */
export function metaFromExif(raw: RawExif | null | undefined): PhotoMeta {
  if (!raw) return { capturedAt: null, lat: null, lon: null };
  const capturedAt = captureDate(raw.DateTimeOriginal ?? raw.CreateDate, raw.OffsetTimeOriginal);
  let lat = isNum(raw.latitude) ? raw.latitude : fromDms(raw.GPSLatitude, raw.GPSLatitudeRef, 'S');
  let lon = isNum(raw.longitude) ? raw.longitude : fromDms(raw.GPSLongitude, raw.GPSLongitudeRef, 'W');
  // 0/0 is what some apps write when they have no fix.
  if (lat === 0 && lon === 0) lat = lon = null;
  if (lat !== null && (lat < -90 || lat > 90)) lat = null;
  if (lon !== null && (lon < -180 || lon > 180)) lon = null;
  return { capturedAt, lat, lon };
}

/** Reads the photo's EXIF. A file exifr cannot read counts as having no metadata. */
export async function readPhotoMeta(file: Blob): Promise<PhotoMeta> {
  try {
    const exifr = (await import('exifr')).default;
    const raw = (await exifr.parse(file, { tiff: true, exif: true, gps: true, ifd1: false })) as RawExif | undefined;
    return metaFromExif(raw);
  } catch {
    return metaFromExif(null);
  }
}
