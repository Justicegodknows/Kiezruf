// On-site gate decisions (US-03, US-06, US-10, US-44) and the gallery 48 h rule.
import { MAX_ACCURACY_M, MAX_PHOTO_AGE_HOURS } from '@kiezruf/shared';
import { decideCameraCapture, decideGalleryPhoto, decideRoute, type ExifCapture, pinAllowed, readExif } from '../src/report/onsite';

const NOW = new Date('2026-11-11T12:00:00Z');
const NK = { lat: 52.4795, lon: 13.4365 }; // Karl-Marx-Straße 100
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
/** A point `m` metres north of `p`. */
const north = (p: { lat: number; lon: number }, m: number) => ({ lat: p.lat + m / 111_195, lon: p.lon });

describe('camera capture', () => {
  test('accepts a fix within 100 m and stamps it with the capture time', () => {
    const d = decideCameraCapture({ ...NK, accuracyM: 12 }, NOW);
    expect(d).toEqual({ kind: 'ok', capture: { ...NK, accuracyM: 12, capturedAt: NOW } });
  });

  test('accuracy exactly 100 m still passes', () => {
    expect(decideCameraCapture({ ...NK, accuracyM: MAX_ACCURACY_M }, NOW).kind).toBe('ok');
  });

  test('accuracy worse than 100 m asks to wait or step outside', () => {
    expect(decideCameraCapture({ ...NK, accuracyM: 150 }, NOW)).toEqual({ kind: 'wait_accuracy', accuracyM: 150 });
  });

  test('a fix without accuracy also asks to wait', () => {
    expect(decideCameraCapture({ ...NK, accuracyM: null }, NOW)).toEqual({ kind: 'wait_accuracy', accuracyM: null });
  });

  test('further photos must be within 150 m of the first', () => {
    expect(decideCameraCapture({ ...north(NK, 140), accuracyM: 10 }, NOW, NK).kind).toBe('ok');
    expect(decideCameraCapture({ ...north(NK, 160), accuracyM: 10 }, NOW, NK)).toEqual({ kind: 'rejected', reason: 'photo_elsewhere' });
  });
});

describe('gallery photo: only if taken on site within 48 h (US-06)', () => {
  const exif = (over: Partial<ExifCapture> = {}): ExifCapture => ({ ...NK, accuracyM: 8, capturedAt: hoursAgo(2), ...over });

  test('accepts a photo with location, accuracy and time from the last 48 h', () => {
    expect(decideGalleryPhoto(exif(), null, NOW)).toEqual({ kind: 'ok', capture: { ...NK, accuracyM: 8, capturedAt: hoursAgo(2) } });
  });

  test(`rejects a photo older than ${MAX_PHOTO_AGE_HOURS} h`, () => {
    expect(decideGalleryPhoto(exif({ capturedAt: hoursAgo(48.1) }), null, NOW)).toEqual({ kind: 'rejected', reason: 'capture_too_old' });
    expect(decideGalleryPhoto(exif({ capturedAt: hoursAgo(47.9) }), null, NOW).kind).toBe('ok');
  });

  test('rejects a photo without location or time', () => {
    expect(decideGalleryPhoto(exif({ lat: null, lon: null }), null, NOW)).toEqual({ kind: 'rejected', reason: 'no_metadata' });
    expect(decideGalleryPhoto(exif({ capturedAt: null }), null, NOW)).toEqual({ kind: 'rejected', reason: 'no_metadata' });
  });

  test('rejects a capture time in the future beyond clock skew', () => {
    expect(decideGalleryPhoto(exif({ capturedAt: new Date(NOW.getTime() + 10 * 60_000) }), null, NOW)).toEqual({
      kind: 'rejected',
      reason: 'capture_in_future',
    });
  });

  test('rejects a photo whose own GPS accuracy is worse than 100 m', () => {
    expect(decideGalleryPhoto(exif({ accuracyM: 250 }), null, NOW)).toEqual({ kind: 'rejected', reason: 'accuracy_too_low' });
  });

  describe('photo without GPS accuracy', () => {
    const noAcc = exif({ accuracyM: null });

    test('accepted when the citizen is still there; the device accuracy is used', () => {
      const d = decideGalleryPhoto(noAcc, { ...north(NK, 40), accuracyM: 15 }, NOW);
      expect(d).toEqual({ kind: 'ok', capture: { ...NK, accuracyM: 15, capturedAt: hoursAgo(2) } });
    });

    test('rejected as not on site when the citizen is elsewhere', () => {
      expect(decideGalleryPhoto(noAcc, { ...north(NK, 500), accuracyM: 10 }, NOW)).toEqual({ kind: 'rejected', reason: 'not_on_site' });
    });

    test('asks to wait when the device fix is too coarse', () => {
      expect(decideGalleryPhoto(noAcc, { ...NK, accuracyM: 300 }, NOW)).toEqual({ kind: 'wait_accuracy', accuracyM: 300 });
    });

    test('rejected when no device fix is available', () => {
      expect(decideGalleryPhoto(noAcc, null, NOW)).toEqual({ kind: 'rejected', reason: 'no_metadata' });
    });
  });

  test('a second photo from elsewhere is rejected', () => {
    expect(decideGalleryPhoto(exif(north(NK, 400)), null, NOW, NK)).toEqual({ kind: 'rejected', reason: 'photo_elsewhere' });
  });
});

describe('readExif', () => {
  test('Android: flat signed decimals and DateTimeOriginal with offset', () => {
    const e = readExif({ GPSLatitude: 52.4795, GPSLongitude: 13.4365, DateTimeOriginal: '2026:11:11 13:00:00', OffsetTimeOriginal: '+01:00' });
    expect(e).toEqual({ lat: 52.4795, lon: 13.4365, accuracyM: null, capturedAt: new Date('2026-11-11T12:00:00Z') });
  });

  test('iOS: nested {GPS} and {Exif} with hemisphere references and accuracy', () => {
    const e = readExif({
      '{GPS}': { Latitude: 33.86, LatitudeRef: 'S', Longitude: 151.2, LongitudeRef: 'E', HPositioningError: 4.5 },
      '{Exif}': { DateTimeOriginal: '2026:11:11 22:00:00', OffsetTimeOriginal: '+10:00' },
    });
    expect(e).toEqual({ lat: -33.86, lon: 151.2, accuracyM: 4.5, capturedAt: new Date('2026-11-11T12:00:00Z') });
  });

  test('rational degree strings with W reference', () => {
    const e = readExif({ GPSLatitude: '40/1,26/1,4600/100', GPSLatitudeRef: 'N', GPSLongitude: '79/1,58/1,3600/100', GPSLongitudeRef: 'W', GPSHPositioningError: '10/1' });
    expect(e.lat).toBeCloseTo(40.446111, 5);
    expect(e.lon).toBeCloseTo(-79.976667, 5);
    expect(e.accuracyM).toBe(10);
  });

  test('falls back to the GPS UTC time stamp', () => {
    const e = readExif({ GPSLatitude: 52.5, GPSLongitude: 13.4, GPSDateStamp: '2026:11:11', GPSTimeStamp: '11:30:15' });
    expect(e.capturedAt).toEqual(new Date('2026-11-11T11:30:15Z'));
  });

  test('(0, 0) and missing data mean no location', () => {
    expect(readExif({ GPSLatitude: 0, GPSLongitude: 0 }).lat).toBeNull();
    expect(readExif(null)).toEqual({ lat: null, lon: null, accuracyM: null, capturedAt: null });
    expect(readExif({ DateTimeOriginal: 'garbage' }).capturedAt).toBeNull();
  });
});

describe('routing and pin', () => {
  test('live tenant names the receiving office (US-41)', () => {
    expect(decideRoute({ live: true, tenant: { name: 'Neukölln', office: 'Bezirksamt Neukölln', status: 'pilot' } })).toEqual({
      kind: 'live',
      tenantName: 'Neukölln',
      office: 'Bezirksamt Neukölln',
    });
  });

  test('not-live or no tenant means "not live here yet" (US-44)', () => {
    expect(decideRoute({ live: false, tenant: { name: 'Friedrichshain-Kreuzberg', status: 'not_live' } })).toEqual({
      kind: 'not_live',
      tenantName: 'Friedrichshain-Kreuzberg',
    });
    expect(decideRoute({ live: false, tenant: null })).toEqual({ kind: 'not_live', tenantName: null });
  });

  test('the pin moves at most 50 m (US-10)', () => {
    expect(pinAllowed(NK, north(NK, 49))).toBe(true);
    expect(pinAllowed(NK, north(NK, 51))).toBe(false);
  });
});
