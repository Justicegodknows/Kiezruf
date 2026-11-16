import { describe, expect, it } from 'vitest';
import { categoryByName, categoryNeedsDescription, CATEGORY_KEYS, checkCapture } from './index';

const now = new Date('2026-11-11T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

describe('on-site location gate (US-03, US-32)', () => {
  it('allows posting at 100 m accuracy', () => {
    expect(checkCapture({ accuracyM: 100, capturedAt: now }, now)).toEqual({ ok: true });
  });

  it('blocks posting at 101 m accuracy', () => {
    expect(checkCapture({ accuracyM: 101, capturedAt: now }, now)).toEqual({ ok: false, reason: 'accuracy_too_low' });
  });

  it('blocks a negative or missing accuracy', () => {
    expect(checkCapture({ accuracyM: -1, capturedAt: now }, now)).toEqual({ ok: false, reason: 'accuracy_too_low' });
    expect(checkCapture({ accuracyM: Number.NaN, capturedAt: now }, now)).toEqual({ ok: false, reason: 'accuracy_too_low' });
  });

  it('accepts a gallery photo taken on-site within the last 48 h', () => {
    expect(checkCapture({ accuracyM: 20, capturedAt: hoursAgo(48) }, now)).toEqual({ ok: true });
  });

  it('rejects a gallery photo older than 48 h', () => {
    expect(checkCapture({ accuracyM: 20, capturedAt: hoursAgo(48.01) }, now)).toEqual({ ok: false, reason: 'capture_too_old' });
  });

  it('rejects a photo without location or time metadata', () => {
    expect(checkCapture({ accuracyM: null, capturedAt: now }, now)).toEqual({ ok: false, reason: 'no_metadata' });
    expect(checkCapture({ accuracyM: 20, capturedAt: null }, now)).toEqual({ ok: false, reason: 'no_metadata' });
    expect(checkCapture({ accuracyM: 20, capturedAt: new Date('nonsense') }, now)).toEqual({ ok: false, reason: 'no_metadata' });
  });

  it('tolerates 5 minutes of clock skew but not more', () => {
    const ahead = (min: number) => new Date(now.getTime() + min * 60_000);
    expect(checkCapture({ accuracyM: 20, capturedAt: ahead(5) }, now)).toEqual({ ok: true });
    expect(checkCapture({ accuracyM: 20, capturedAt: ahead(6) }, now)).toEqual({ ok: false, reason: 'capture_in_future' });
  });
});

describe('categories (US-08)', () => {
  it('has unique keys in two groups', () => {
    expect(new Set(CATEGORY_KEYS).size).toBe(CATEGORY_KEYS.length);
  });

  it('requires a description for "Other" only', () => {
    expect(categoryNeedsDescription('traffic_other')).toBe(true);
    expect(categoryNeedsDescription('community_other')).toBe(true);
    expect(categoryNeedsDescription('pothole')).toBe(false);
  });

  it('finds a category by its product-plan name', () => {
    expect(categoryByName('Pothole')?.key).toBe('pothole');
    expect(categoryByName('pothole')?.key).toBe('pothole');
    expect(categoryByName('Other')).toBeUndefined();
    expect(categoryByName('Spaceship')).toBeUndefined();
  });
});
