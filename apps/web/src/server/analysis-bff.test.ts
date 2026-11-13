// @vitest-environment node
// Backend-for-frontend rules for the Phase 3 endpoints (README "API (analysis and AI, Phase 3)"): which token each
// gets, which query keys pass, and the CSV export passed through unchanged (US-55). One Supabase session (ENG-22):
// `citizen` and `staff` below are two signed-in people, a citizen at aal1 and a staff member at aal2.
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_COOKIE, fake, stubSupabaseEnv } from '@/test/fake-supabase';
import { matchRule, proxy } from './bff';

vi.mock('@supabase/ssr', async () => (await import('@/test/fake-supabase')).ssrModule);

const CITIZEN = 'cit_abcdefghijklmnopqrstuvwxyz0123456789';
const STAFF = 'stf_abcdefghijklmnopqrstuvwxyz0123456789';
const ID = 'BE-NK-2026-0112';
const UUID = '0b6f3f3e-6c43-4a8e-9f62-6a1f1b1f2c3d';

interface ApiCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

let apiCalls: ApiCall[];

function mockApi(answer: (call: ApiCall) => Response) {
  apiCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const call = { url, method: init.method ?? 'GET', headers: init.headers as Record<string, string>, body: init.body as string | undefined };
      apiCalls.push(call);
      return answer(call);
    }),
  );
}

const jsonAnswer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function request(path: string, init: { method?: string; body?: unknown; citizen?: string; staff?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { host: 'localhost:3000', ...init.headers };
  const session = init.staff ?? init.citizen;
  if (session) headers.cookie = `${AUTH_COOKIE}=${session}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(`http://localhost:3000${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

const segments = (path: string) => path.split('?')[0]!.replace(/^\/api\//, '').split('/');

beforeEach(() => {
  fake.reset();
  fake.tokens[CITIZEN] = { aal: 'aal1' };
  fake.tokens[STAFF] = { aal: 'aal2', totpAt: Math.floor(Date.now() / 1000) - 60 };
  stubSupabaseEnv(vi.stubEnv);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('BFF allowlist: Phase 3 endpoints', () => {
  it('gives the citizen endpoints the session token (US-13, US-14)', async () => {
    for (const [method, path] of [
      ['POST', 'uploads/suggest'],
      ['POST', 'reports/duplicates'],
      ['POST', `reports/${ID}/co-report`],
    ] as const) {
      expect(matchRule(method, path)?.auth, `${method} ${path}`).toBe('citizen');
      expect(matchRule('GET', path), `GET ${path}`).toBeNull();
    }
    mockApi(() => jsonAnswer({ category: 'pothole', confidence: 0.9, preselect: true }));
    const guest = await proxy(request('/api/uploads/suggest', { method: 'POST', body: { key: 'k' } }), ['uploads', 'suggest']);
    expect(guest.status).toBe(401);
    expect(apiCalls).toHaveLength(0);
    const ok = await proxy(request('/api/uploads/suggest', { method: 'POST', body: { key: 'originals/a/1.jpg' }, citizen: CITIZEN }), ['uploads', 'suggest']);
    expect(await ok.json()).toEqual({ category: 'pothole', confidence: 0.9, preselect: true });
    expect(apiCalls[0]).toMatchObject({ url: 'http://api.test/uploads/suggest', method: 'POST', body: JSON.stringify({ key: 'originals/a/1.jpg' }) });
    expect(apiCalls[0]!.headers.authorization).toBe(`Bearer ${CITIZEN}`);
  });

  it('forwards co-reporting with its body to the matched report', async () => {
    mockApi(() => jsonAnswer({ publicId: ID }, 201));
    const body = { capture: { lat: 52.48, lon: 13.43, accuracyM: 10, capturedAt: '2026-11-12T08:00:00.000Z' }, photoKeys: ['k1'] };
    const response = await proxy(request(`/api/reports/${ID}/co-report`, { method: 'POST', body, citizen: CITIZEN }), ['reports', ID, 'co-report']);
    expect(response.status).toBe(201);
    expect(apiCalls[0]).toMatchObject({ url: `http://api.test/reports/${ID}/co-report`, body: JSON.stringify(body) });
  });

  it('marks every console endpoint as a staff route', () => {
    for (const [method, path] of [
      ['GET', `staff/reports/${ID}/duplicates`],
      ['GET', 'staff/hotspots'],
      ['GET', 'staff/trends'],
      ['GET', 'staff/briefings'],
      ['POST', `staff/briefings/items/${UUID}/rating`],
      ['PUT', 'staff/me/preferences'],
      ['GET', 'staff/export/queue.csv'],
      ['GET', 'staff/export/trends.csv'],
    ] as const) {
      expect(matchRule(method, path)?.auth, `${method} ${path}`).toBe('staff');
    }
    // Wrong methods and malformed IDs stay closed.
    expect(matchRule('POST', 'staff/briefings')).toBeNull();
    expect(matchRule('GET', `staff/briefings/items/${UUID}/rating`)).toBeNull();
    expect(matchRule('POST', 'staff/briefings/items/not-a-uuid/rating')).toBeNull();
    expect(matchRule('GET', 'staff/me/preferences')).toBeNull();
    expect(matchRule('GET', 'staff/export/other.csv')).toBeNull();
    expect(matchRule('GET', 'staff/reports/x/duplicates')).toBeNull();
  });

  it('answers 401 for a console endpoint without a session, without calling the API', async () => {
    mockApi(() => jsonAnswer({}));
    for (const path of ['/api/staff/briefings', '/api/staff/hotspots', '/api/staff/trends', '/api/staff/export/queue.csv']) {
      expect((await proxy(request(path), segments(path))).status, path).toBe(401);
    }
    expect(apiCalls).toHaveLength(0);
  });

  it('passes only the documented query keys on', async () => {
    mockApi(() => jsonAnswer({}));
    await proxy(request(`/api/staff/hotspots?tenantId=${UUID}&evil=1&weeks=8`, { staff: STAFF }), ['staff', 'hotspots']);
    await proxy(request(`/api/staff/trends?tenantId=${UUID}&weeks=8&from=x`, { staff: STAFF }), ['staff', 'trends']);
    await proxy(request(`/api/staff/briefings?tenantId=${UUID}&limit=99`, { staff: STAFF }), ['staff', 'briefings']);
    await proxy(request(`/api/staff/reports/${ID}/duplicates?radius=999`, { staff: STAFF }), ['staff', 'reports', ID, 'duplicates']);
    expect(apiCalls.map((c) => c.url)).toEqual([
      `http://api.test/staff/hotspots?tenantId=${UUID}`,
      `http://api.test/staff/trends?tenantId=${UUID}&weeks=8`,
      `http://api.test/staff/briefings?tenantId=${UUID}`,
      `http://api.test/staff/reports/${ID}/duplicates`,
    ]);
    expect(apiCalls.every((c) => c.headers.authorization === `Bearer ${STAFF}`)).toBe(true);
  });

  it('forwards a briefing rating and the email preference with their bodies (US-54, US-56)', async () => {
    mockApi(() => new Response(null, { status: 204 }));
    const rating = await proxy(
      request(`/api/staff/briefings/items/${UUID}/rating`, { method: 'POST', body: { useful: false, note: 'Wrong street' }, staff: STAFF }),
      ['staff', 'briefings', 'items', UUID, 'rating'],
    );
    expect(rating.status).toBe(204);
    const prefs = await proxy(request('/api/staff/me/preferences', { method: 'PUT', body: { briefingEmail: false }, staff: STAFF }), ['staff', 'me', 'preferences']);
    expect(prefs.status).toBe(204);
    expect(apiCalls).toMatchObject([
      { url: `http://api.test/staff/briefings/items/${UUID}/rating`, method: 'POST', body: JSON.stringify({ useful: false, note: 'Wrong street' }) },
      { url: 'http://api.test/staff/me/preferences', method: 'PUT', body: JSON.stringify({ briefingEmail: false }) },
    ]);
  });
});

describe('BFF: CSV export passes through unchanged (US-55)', () => {
  const CSV = 'publicId;category;status;level;score\r\nBE-NK-2026-0112;traffic_light;acknowledged;Critical;97.1\r\n"Ä, ö";"a ""b""";x;y;z\r\n';

  it('sends the staff token with tenant and date range, and returns the CSV byte for byte with type and file name', async () => {
    mockApi(
      () =>
        new Response(CSV, {
          status: 200,
          headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="kiezruf-queue-2026-11-12.csv"', 'set-cookie': 'x=1', 'x-internal': 'secret' },
        }),
    );
    const response = await proxy(
      request(`/api/staff/export/queue.csv?tenantId=${UUID}&from=2026-10-01&to=2026-11-12&sort=age`, { staff: STAFF, citizen: CITIZEN }),
      ['staff', 'export', 'queue.csv'],
    );
    expect(apiCalls[0]!.url).toBe(`http://api.test/staff/export/queue.csv?tenantId=${UUID}&from=2026-10-01&to=2026-11-12`);
    expect(apiCalls[0]!.headers.authorization).toBe(`Bearer ${STAFF}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="kiezruf-queue-2026-11-12.csv"');
    expect(response.headers.get('cache-control')).toBe('no-store');
    // Nothing else from the API leaks through.
    expect(response.headers.get('x-internal')).toBeNull();
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new TextEncoder().encode(CSV));
  });

  it('passes the trends CSV with only the tenant on', async () => {
    mockApi(() => new Response('week;category;count\n', { status: 200, headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="trends.csv"' } }));
    const response = await proxy(request(`/api/staff/export/trends.csv?tenantId=${UUID}&from=2026-01-01`, { staff: STAFF }), ['staff', 'export', 'trends.csv']);
    expect(apiCalls[0]!.url).toBe(`http://api.test/staff/export/trends.csv?tenantId=${UUID}`);
    expect(await response.text()).toBe('week;category;count\n');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="trends.csv"');
  });

  it("relays the API's JSON errors and signs out of Supabase on 401 unauthorized", async () => {
    mockApi(() => jsonAnswer({ error: 'unauthorized' }, 401));
    const response = await proxy(request('/api/staff/export/queue.csv', { staff: STAFF, citizen: CITIZEN }), ['staff', 'export', 'queue.csv']);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
    const cookies = response.headers.getSetCookie();
    expect(cookies.find((c) => c.startsWith(`${AUTH_COOKIE}=`))).toMatch(/Max-Age=0/);
    expect(fake.calls.find((c) => c.method === 'signOut')?.args).toEqual({ scope: 'local' });
  });

  it('answers 502 unavailable when the API cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('ECONNREFUSED'))));
    const response = await proxy(request('/api/staff/export/trends.csv', { staff: STAFF }), ['staff', 'export', 'trends.csv']);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'unavailable' });
  });

  it('refuses a download started from another site (CSRF)', async () => {
    mockApi(() => new Response(CSV));
    const response = await proxy(request('/api/staff/export/queue.csv', { staff: STAFF, headers: { 'sec-fetch-site': 'cross-site' } }), ['staff', 'export', 'queue.csv']);
    expect(response.status).toBe(403);
    expect(apiCalls).toHaveLength(0);
  });
});
