import { MAX_PIN_ADJUST_M } from '@kiezruf/shared';
import { describe, expect, it } from 'vitest';
import { interpolate, plural, translator } from '@/i18n';
import { codeForStatus, errorMessageKey } from './errors';
import { clampToRadius, distanceM, offsetM } from './geo';
import { reportIdFromSegment, reportPath, tenantSlug } from './paths';

describe('error codes → messages', () => {
  it('maps every known code to its own message and unknown codes to the generic one', () => {
    expect(errorMessageKey('not_on_site')).toBe('error.not_on_site');
    expect(errorMessageKey('location_denied')).toBe('error.location_denied');
    expect(errorMessageKey('something_new')).toBe('error.unknown');
    expect(errorMessageKey(undefined)).toBe('error.unknown');
    expect(translator('de')(errorMessageKey('too_many_codes'))).toMatch(/Zu viele Codes/);
    expect(translator('en')(errorMessageKey('not_live'))).toBe('Kiezruf is not live here yet.');
  });

  it('derives a code from the HTTP status when the body has none', () => {
    expect(codeForStatus(401)).toBe('unauthorized');
    expect(codeForStatus(429)).toBe('rate_limited');
    expect(codeForStatus(503)).toBe('unavailable');
    expect(codeForStatus(418)).toBe('unknown');
  });
});

describe('translations', () => {
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(interpolate('{a} und {b}', { a: 1 })).toBe('1 und {b}');
  });

  it('picks singular and plural forms', () => {
    expect(plural('de', 'meToo.count', 1)).toBe('1 Stimme');
    expect(plural('de', 'meToo.count', 1200)).toBe('1.200 Stimmen');
    expect(plural('en', 'meToo.count', 2)).toBe('2 votes');
  });
});

describe('geometry', () => {
  const origin = { lat: 52.4811, lon: 13.4353 };

  it('moves a point by metres', () => {
    expect(distanceM(origin, offsetM(origin, 30, 40))).toBeCloseTo(50, 0);
  });

  it('keeps the pin within 50 m of the capture point (US-10)', () => {
    const far = offsetM(origin, 0, 200);
    const clamped = clampToRadius(origin, far, MAX_PIN_ADJUST_M);
    expect(distanceM(origin, clamped)).toBeLessThanOrEqual(MAX_PIN_ADJUST_M);
    expect(distanceM(origin, clamped)).toBeGreaterThan(MAX_PIN_ADJUST_M - 1);
    const near = offsetM(origin, 10, 10);
    expect(clampToRadius(origin, near, MAX_PIN_ADJUST_M)).toEqual(near);
  });
});

describe('report paths mirror the tenant tree', () => {
  it('builds /berlin/<bezirk>/<id>', () => {
    expect(tenantSlug('Neukölln')).toBe('neukoelln');
    expect(tenantSlug('Friedrichshain-Kreuzberg')).toBe('friedrichshain-kreuzberg');
    expect(tenantSlug('Tempelhof-Schöneberg')).toBe('tempelhof-schoeneberg');
    expect(reportPath({ publicId: 'BE-NK-2026-0112', tenantName: 'Neukölln' })).toBe('/berlin/neukoelln/be-nk-2026-0112');
  });

  it('reads the ID back and rejects anything else', () => {
    expect(reportIdFromSegment('be-nk-2026-0112')).toBe('BE-NK-2026-0112');
    expect(reportIdFromSegment('../etc')).toBeNull();
  });
});
