import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch } from '@/test/helpers';
import { postReport } from './post-report';

afterEach(() => vi.unstubAllGlobals());

describe('postReport (US-06, US-11)', () => {
  const fix = { lat: 52.4811, lon: 13.4353, accuracyM: 20 };
  const capturedAt = new Date('2026-11-11T09:00:00Z');

  it('uploads each photo to its presigned URL, then posts the report with the keys', async () => {
    let n = 0;
    const calls = mockFetch(({ method, path }) => {
      if (method === 'POST' && path === '/api/uploads') {
        n += 1;
        return { status: 201, body: { key: `originals/acc/${n}.jpg`, url: `https://storage.test/put/${n}`, method: 'PUT', headers: { 'Content-Type': 'image/jpeg' } } };
      }
      if (method === 'POST' && path === '/api/reports') return { status: 201, body: { publicId: 'BE-NK-2026-0118', status: 'processing' } };
      return undefined;
    });
    const put = vi.fn(async () => new Response(null, { status: 200 }));
    const files = [new File(['a'], 'a.jpg', { type: 'image/jpeg' }), new File(['b'], 'b.jpg', { type: 'image/jpeg' })];

    const result = await postReport({ category: 'pothole', description: '  deep  ', dangerous: true, fix, capturedAt, pin: { lat: 52.4812, lon: 13.4354 }, files }, put);

    expect(result).toMatchObject({ ok: true, data: { publicId: 'BE-NK-2026-0118' } });
    expect(put).toHaveBeenCalledTimes(2);
    expect(put).toHaveBeenNthCalledWith(1, 'https://storage.test/put/1', { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: files[0] });
    expect(calls.filter((c) => c.path === '/api/uploads').map((c) => c.body)).toEqual([{ contentType: 'image/jpeg' }, { contentType: 'image/jpeg' }]);
    expect(calls.find((c) => c.path === '/api/reports')?.body).toEqual({
      category: 'pothole',
      description: 'deep',
      dangerous: true,
      capture: { lat: 52.4811, lon: 13.4353, accuracyM: 20, capturedAt: '2026-11-11T09:00:00.000Z' },
      pin: { lat: 52.4812, lon: 13.4354 },
      photoKeys: ['originals/acc/1.jpg', 'originals/acc/2.jpg'],
    });
  });

  it('stops with upload_failed when the storage refuses the file', async () => {
    const calls = mockFetch(({ path }) => (path === '/api/uploads' ? { status: 201, body: { key: 'k', url: 'https://storage.test/x' } } : undefined));
    const result = await postReport(
      { category: 'pothole', description: '', dangerous: false, fix, capturedAt, pin: null, files: [new File(['a'], 'a.jpg', { type: 'image/jpeg' })] },
      async () => new Response(null, { status: 403 }),
    );
    expect(result).toMatchObject({ ok: false, error: 'upload_failed' });
    expect(calls.some((c) => c.path === '/api/reports')).toBe(false);
  });

  it('passes not_live from the API through, so the page can show "not live here yet" (US-44)', async () => {
    mockFetch(({ path }) => {
      if (path === '/api/uploads') return { status: 201, body: { key: 'k', url: 'https://storage.test/x' } };
      if (path === '/api/reports') return { status: 422, body: { error: 'not_live', tenant: 'Spandau' } };
      return undefined;
    });
    const result = await postReport(
      { category: 'pothole', description: '', dangerous: false, fix, capturedAt, pin: null, files: [new File(['a'], 'a.jpg', { type: 'image/jpeg' })] },
      async () => new Response(null, { status: 200 }),
    );
    expect(result).toMatchObject({ ok: false, status: 422, error: 'not_live', body: { tenant: 'Spandau' } });
  });
});
