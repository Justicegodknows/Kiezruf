// Category suggestion (US-14) and "Already reported?" (US-13) helpers, and posting with an early upload.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch } from '@/test/helpers';
import { coReport, postReport } from './post-report';
import { categoryToPreselect, duplicateSignature, findDuplicates, normalizeDuplicates, normalizeSuggestion, requestSuggestion, SUGGESTION_THRESHOLD } from './report-assist';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('category suggestion: pre-select threshold (US-14)', () => {
  it('pre-selects only when the API says so, at 0.80 or above, for a known category', () => {
    expect(SUGGESTION_THRESHOLD).toBe(0.8);
    expect(categoryToPreselect(normalizeSuggestion({ category: 'pothole', confidence: 0.8, preselect: true }), '')).toBe('pothole');
    expect(categoryToPreselect(normalizeSuggestion({ category: 'pothole', confidence: 0.97, preselect: true }), '')).toBe('pothole');
    // Below the threshold the API answers preselect: false; nothing is chosen for the citizen.
    expect(categoryToPreselect(normalizeSuggestion({ category: 'pothole', confidence: 0.79, preselect: false }), '')).toBeNull();
    // Inconsistent answers never pre-select below the threshold.
    expect(categoryToPreselect(normalizeSuggestion({ category: 'pothole', confidence: 0.5, preselect: true }), '')).toBeNull();
    // Unknown category, or a timeout (all null / false).
    expect(categoryToPreselect(normalizeSuggestion({ category: 'unicorns', confidence: 0.99, preselect: true }), '')).toBeNull();
    expect(categoryToPreselect(normalizeSuggestion({ category: null, confidence: null, preselect: false }), '')).toBeNull();
    expect(categoryToPreselect(normalizeSuggestion(null), '')).toBeNull();
  });

  it('never overrides a category the citizen already picked', () => {
    expect(categoryToPreselect({ category: 'pothole', confidence: 0.95, preselect: true }, 'bike_lane')).toBeNull();
  });

  it('answers "no suggestion" on an error and when the API takes too long', async () => {
    mockFetch(() => ({ status: 503, body: { error: 'unavailable' } }));
    expect(await requestSuggestion('k')).toEqual({ category: null, confidence: null, preselect: false });

    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    vi.useFakeTimers();
    const pending = requestSuggestion('k', 4000);
    await vi.advanceTimersByTimeAsync(4000);
    expect(await pending).toEqual({ category: null, confidence: null, preselect: false });
  });

  it('asks with the uploaded photo key', async () => {
    const calls = mockFetch(() => ({ body: { category: 'traffic_light', confidence: 0.91, preselect: true } }));
    expect(await requestSuggestion('originals/acc/1.jpg')).toEqual({ category: 'traffic_light', confidence: 0.91, preselect: true });
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/uploads/suggest', body: { key: 'originals/acc/1.jpg' } });
  });
});

describe('"Already reported?" (US-13)', () => {
  it('keeps at most 3 matches and reads the photo as a URL or { url }', () => {
    const matches = normalizeDuplicates({
      matches: [
        { publicId: 'BE-NK-2026-0112', category: 'pothole', status: 'open', distanceM: 35, meTooCount: 12, photo: 'https://p.test/1.jpg', similarity: 0.9 },
        { publicId: 'BE-NK-2026-0113', category: 'pothole', status: 'acknowledged', distanceM: 80, meTooCount: 2, photo: { url: 'https://p.test/2.jpg' } },
        { publicId: 'BE-NK-2026-0114', category: 'bike_lane', status: 'open', distanceM: 120, photo: null },
        { publicId: 'BE-NK-2026-0115', category: 'pothole', status: 'open', distanceM: 140 },
      ],
    });
    expect(matches.map((m) => m.publicId)).toEqual(['BE-NK-2026-0112', 'BE-NK-2026-0113', 'BE-NK-2026-0114']);
    expect(matches.map((m) => m.photo)).toEqual(['https://p.test/1.jpg', 'https://p.test/2.jpg', null]);
    expect(matches[2]!.meTooCount).toBe(0);
    // Public data only: whatever else the API sends is not kept.
    expect(Object.keys(matches[0]!).sort()).toEqual(['category', 'distanceM', 'meTooCount', 'photo', 'publicId', 'status', 'tenantName']);
  });

  it('sends location, category and photo key; an error other than 401 means "no matches"', async () => {
    const calls = mockFetch(() => ({ status: 500, body: { error: 'unavailable' } }));
    expect(await findDuplicates({ lat: 52.48, lon: 13.43, category: 'pothole', photoKey: 'k1' })).toMatchObject({ ok: true, data: [] });
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/reports/duplicates', body: { lat: 52.48, lon: 13.43, category: 'pothole', photoKey: 'k1' } });
    mockFetch(() => ({ status: 401, body: { error: 'unauthorized' } }));
    expect(await findDuplicates({ lat: 52.48, lon: 13.43, category: 'pothole' })).toMatchObject({ ok: false, status: 401 });
  });

  it('changes its signature when the location, category or photo changes', () => {
    const base = { lat: 52.48, lon: 13.43, category: 'pothole', photoKey: 'k1' };
    const sig = duplicateSignature(base);
    expect(duplicateSignature({ ...base })).toBe(sig);
    expect(duplicateSignature({ ...base, category: 'bike_lane' })).not.toBe(sig);
    expect(duplicateSignature({ ...base, lat: 52.481 })).not.toBe(sig);
    expect(duplicateSignature({ ...base, photoKey: 'k2' })).not.toBe(sig);
  });
});

describe('posting with an early upload and a shown suggestion', () => {
  const fix = { lat: 52.4811, lon: 13.4353, accuracyM: 20 };
  const capturedAt = new Date('2026-11-12T09:00:00Z');
  const files = [new File(['a'], 'a.jpg', { type: 'image/jpeg' }), new File(['b'], 'b.jpg', { type: 'image/jpeg' })];

  it('does not upload the first photo again and sends the suggestion the citizen saw', async () => {
    const calls = mockFetch(({ path }) => {
      if (path === '/api/uploads') return { status: 201, body: { key: 'originals/acc/2.jpg', url: 'https://storage.test/put/2' } };
      if (path === '/api/reports') return { status: 201, body: { publicId: 'BE-NK-2026-0118', status: 'processing' } };
      return undefined;
    });
    const put = vi.fn(async () => new Response(null, { status: 200 }));
    const result = await postReport(
      { category: 'bike_lane', description: '', dangerous: false, fix, capturedAt, pin: null, files, uploadedKeys: ['originals/acc/1.jpg'], suggestion: { category: 'pothole', confidence: 0.86 } },
      put,
    );
    expect(result.ok).toBe(true);
    expect(put).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c.path === '/api/uploads')).toHaveLength(1);
    expect(calls.find((c) => c.path === '/api/reports')?.body).toMatchObject({
      category: 'bike_lane',
      photoKeys: ['originals/acc/1.jpg', 'originals/acc/2.jpg'],
      suggestion: { category: 'pothole', confidence: 0.86 },
    });
  });

  it('sends no suggestion when none was shown', async () => {
    const calls = mockFetch(({ path }) => (path === '/api/reports' ? { status: 201, body: { publicId: 'BE-NK-2026-0118', status: 'processing' } } : undefined));
    await postReport({ category: 'pothole', description: '', dangerous: false, fix, capturedAt, pin: null, files: [files[0]!], uploadedKeys: ['k1'], suggestion: null }, vi.fn());
    expect(calls.find((c) => c.path === '/api/reports')?.body).not.toHaveProperty('suggestion');
  });

  it('co-reports with the same capture and photo keys (US-13)', async () => {
    const calls = mockFetch(({ path }) => (path === '/api/reports/BE-NK-2026-0112/co-report' ? { status: 201, body: { publicId: 'BE-NK-2026-0112' } } : undefined));
    const result = await coReport('BE-NK-2026-0112', { fix, capturedAt, files: [files[0]!], uploadedKeys: ['k1'] }, vi.fn());
    expect(result).toMatchObject({ ok: true, data: { publicId: 'BE-NK-2026-0112' } });
    expect(calls[0]).toMatchObject({
      method: 'POST',
      body: { capture: { lat: 52.4811, lon: 13.4353, accuracyM: 20, capturedAt: '2026-11-12T09:00:00.000Z' }, photoKeys: ['k1'] },
    });
  });
});
