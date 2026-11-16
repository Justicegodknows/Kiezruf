import { MAX_PHOTO_AGE_HOURS } from '@kiezruf/shared';
import { describe, expect, it } from 'vitest';
import { captureDate, metaFromExif } from './exif';
import { assessPhoto, composeDecision, uploadTypeOf, type PhotoMeta } from './photo-check';

const NOW = new Date('2026-11-11T12:00:00Z');
const JPEG = { name: 'IMG_0001.JPG', type: 'image/jpeg' };
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const meta = (over: Partial<PhotoMeta> = {}): PhotoMeta => ({ capturedAt: hoursAgo(1), lat: 52.48, lon: 13.43, ...over });

describe('assessPhoto: post or draft only (US-04, US-06)', () => {
  it('allows a photo with location and a capture time within 48 h', () => {
    expect(assessPhoto(JPEG, meta(), NOW)).toEqual({ postable: true });
    expect(assessPhoto(JPEG, meta({ capturedAt: hoursAgo(MAX_PHOTO_AGE_HOURS - 0.01) }), NOW)).toEqual({ postable: true });
  });

  it('keeps a photo without location as a draft', () => {
    expect(assessPhoto(JPEG, meta({ lat: null, lon: null }), NOW)).toEqual({ postable: false, reason: 'no_metadata' });
  });

  it('keeps a photo without capture time as a draft', () => {
    expect(assessPhoto(JPEG, meta({ capturedAt: null }), NOW)).toEqual({ postable: false, reason: 'no_metadata' });
  });

  it('keeps a photo older than 48 h as a draft', () => {
    expect(assessPhoto(JPEG, meta({ capturedAt: hoursAgo(MAX_PHOTO_AGE_HOURS + 0.1) }), NOW)).toEqual({ postable: false, reason: 'capture_too_old' });
  });

  it('accepts a few minutes of clock skew but not a capture time far in the future', () => {
    expect(assessPhoto(JPEG, meta({ capturedAt: new Date(NOW.getTime() + 2 * 60_000) }), NOW)).toEqual({ postable: true });
    expect(assessPhoto(JPEG, meta({ capturedAt: new Date(NOW.getTime() + 60 * 60_000) }), NOW)).toEqual({ postable: false, reason: 'capture_in_future' });
  });

  it('rejects file types the API does not take', () => {
    expect(assessPhoto({ name: 'scan.gif', type: 'image/gif' }, meta(), NOW)).toEqual({ postable: false, reason: 'unsupported_type' });
  });
});

describe('uploadTypeOf', () => {
  it('maps MIME types and, without one, the extension', () => {
    expect(uploadTypeOf({ name: 'a.jpg', type: 'image/jpeg' })).toBe('image/jpeg');
    expect(uploadTypeOf({ name: 'a.HEIC', type: '' })).toBe('image/heic');
    expect(uploadTypeOf({ name: 'a.heif', type: 'image/heif' })).toBe('image/heic');
    expect(uploadTypeOf({ name: 'a.png', type: '' })).toBe('image/png');
    expect(uploadTypeOf({ name: 'a.webp', type: 'image/webp' })).toBeNull();
    expect(uploadTypeOf({ name: 'noext', type: '' })).toBeNull();
  });
});

describe('composeDecision', () => {
  const ok = (h: number) => ({ meta: meta({ capturedAt: hoursAgo(h) }), verdict: { postable: true } as const });

  it('posts when every photo passes, with the oldest capture time', () => {
    expect(composeDecision([ok(1), ok(5), ok(2)])).toEqual({ kind: 'post', capturedAt: hoursAgo(5) });
  });

  it('is a draft as soon as one photo fails, listing each reason once', () => {
    const bad = { meta: meta({ lat: null }), verdict: { postable: false, reason: 'no_metadata' } as const };
    expect(composeDecision([ok(1), bad, bad])).toEqual({ kind: 'draft', reasons: ['no_metadata'] });
  });

  it('needs at least one and at most three photos', () => {
    expect(composeDecision([])).toEqual({ kind: 'empty' });
    expect(composeDecision([ok(1), ok(1), ok(1), ok(1)])).toEqual({ kind: 'too_many' });
  });
});

describe('metaFromExif', () => {
  it('reads exifr latitude/longitude and DateTimeOriginal', () => {
    const at = new Date(2026, 10, 11, 9, 30, 0);
    expect(metaFromExif({ DateTimeOriginal: at, latitude: 52.48, longitude: 13.43 })).toEqual({ capturedAt: at, lat: 52.48, lon: 13.43 });
  });

  it('falls back to the raw GPS degrees, minutes, seconds and hemisphere', () => {
    const m = metaFromExif({ CreateDate: new Date(2026, 0, 1), GPSLatitude: [52, 30, 0], GPSLatitudeRef: 'N', GPSLongitude: [13, 15, 0], GPSLongitudeRef: 'W' });
    expect(m.lat).toBeCloseTo(52.5);
    expect(m.lon).toBeCloseTo(-13.25);
  });

  it('treats a missing EXIF block, 0/0 coordinates and out-of-range values as missing', () => {
    expect(metaFromExif(undefined)).toEqual({ capturedAt: null, lat: null, lon: null });
    expect(metaFromExif({ DateTimeOriginal: new Date(), latitude: 0, longitude: 0 })).toMatchObject({ lat: null, lon: null });
    expect(metaFromExif({ latitude: 95, longitude: 13 })).toMatchObject({ lat: null, lon: 13 });
  });
});

describe('captureDate', () => {
  it('applies OffsetTimeOriginal to the wall-clock time', () => {
    const wall = new Date(2026, 10, 11, 14, 0, 0); // as exifr revives it: local wall-clock time
    expect(captureDate(wall, '+01:00')?.toISOString()).toBe('2026-11-11T13:00:00.000Z');
    expect(captureDate(wall, '-05:00')?.toISOString()).toBe('2026-11-11T19:00:00.000Z');
  });

  it('parses an unrevived EXIF date string and rejects garbage', () => {
    expect(captureDate('2026:11:11 14:00:00', '+00:00')?.toISOString()).toBe('2026-11-11T14:00:00.000Z');
    expect(captureDate('yesterday', undefined)).toBeNull();
    expect(captureDate(undefined, undefined)).toBeNull();
  });
});
