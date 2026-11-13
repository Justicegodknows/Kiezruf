// @vitest-environment node
// The backend-for-frontend proxy with the Supabase session (ENG-22): which token each route gets, what a 401 does
// to the session, and the allowlist, CSRF and body checks. Supabase is a fake (src/test/fake-supabase.ts).
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_COOKIE, fake, stubSupabaseEnv } from '@/test/fake-supabase';
import { matchRule, proxy } from './bff';

vi.mock('@supabase/ssr', async () => (await import('@/test/fake-supabase')).ssrModule);

const CITIZEN = 'tok_citizen_abcdefghijklmnopqrstuvwxyz';
const STAFF = 'tok_staff_abcdefghijklmnopqrstuvwxyz01';
const ID = 'BE-NK-2026-0112';
const UUID = '0b6f3f3e-6c43-4a8e-9f62-6a1f1b1f2c3d';

interface ApiCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

let apiCalls: ApiCall[];

function mockApi(answer: (call: ApiCall) => { status: number; body?: unknown } | Response) {
  apiCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const call = { url, method: init.method ?? 'GET', headers: init.headers as Record<string, string>, body: init.body as string | undefined };
      apiCalls.push(call);
      const result = answer(call);
      if (result instanceof Response) return result;
      return new Response(result.body === undefined ? null : JSON.stringify(result.body), { status: result.status });
    }),
  );
}

function request(path: string, init: { method?: string; body?: unknown; session?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { host: 'localhost:3000', ...init.headers };
  if (init.session) headers.cookie = `${AUTH_COOKIE}=${init.session}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(`http://localhost:3000${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

const segments = (path: string) => path.split('?')[0]!.replace(/^\/api\//, '').split('/');
const call = (path: string, init: Parameters<typeof request>[1] = {}) => proxy(request(path, init), segments(path));
const authCookie = (response: Response) => response.headers.getSetCookie().find((c) => c.startsWith(`${AUTH_COOKIE}=`)) ?? '';

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

describe('BFF proxy: the access token of the Supabase session', () => {
  it('sends the access token to citizen routes', async () => {
    mockApi(() => ({ status: 200, body: { voted: true, meTooCount: 3 } }));
    const body = { lat: 52.48, lon: 13.43, accuracyM: 12 };
    const response = await call(`/api/reports/${ID}/me-too`, { method: 'PUT', body, session: CITIZEN });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ voted: true, meTooCount: 3 });
    expect(apiCalls[0]).toMatchObject({ url: `http://api.test/reports/${ID}/me-too`, method: 'PUT', body: JSON.stringify(body) });
    expect(apiCalls[0]!.headers.authorization).toBe(`Bearer ${CITIZEN}`);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('sends the same session token to staff routes; a staff member at aal2 can also act as a citizen', async () => {
    mockApi(() => ({ status: 200, body: { reports: [] } }));
    await call('/api/staff/reports', { session: STAFF });
    await call('/api/me/reports', { session: STAFF });
    expect(apiCalls.map((c) => c.headers.authorization)).toEqual([`Bearer ${STAFF}`, `Bearer ${STAFF}`]);
  });

  it('keeps public browsing anonymous: no token even when signed in, only known query parameters', async () => {
    mockApi(() => ({ status: 200, body: { reports: [] } }));
    await call('/api/public/reports?lat=52.5&lon=13.4&status=open&evil=1', { session: CITIZEN });
    expect(apiCalls[0]!.url).toBe('http://api.test/public/reports?lat=52.5&lon=13.4&status=open');
    expect(apiCalls[0]!.headers.authorization).toBeUndefined();
    // Public routes do not even look at the session.
    expect(fake.created).toHaveLength(0);
  });

  it('opens forward links without any token (US-45)', async () => {
    mockApi(() => ({ status: 410, body: { error: 'link_expired' } }));
    const token = 'fwd_0123456789abcdefghij';
    const response = await call(`/api/forwarded/${token}`, { session: STAFF });
    expect(response.status).toBe(410);
    expect(apiCalls[0]!.url).toBe(`http://api.test/forwarded/${token}`);
    expect(apiCalls[0]!.headers.authorization).toBeUndefined();
  });

  it('answers 401 without calling the API when there is no session', async () => {
    mockApi(() => ({ status: 200, body: {} }));
    for (const path of ['/api/me/reports', '/api/staff/reports']) {
      const response = await call(path);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'unauthorized' });
    }
    expect(apiCalls).toHaveLength(0);
  });

  it('answers 401 when Supabase is not configured, without calling the API', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    mockApi(() => ({ status: 200, body: {} }));
    expect((await call('/api/me/reports', { session: CITIZEN })).status).toBe(401);
    expect(apiCalls).toHaveLength(0);
  });

  it('refreshes an expired access token and sends the new cookie back', async () => {
    fake.refresh.tok_expired_abcdefghijklmnopqrstu = CITIZEN;
    mockApi(() => ({ status: 200, body: { reports: [] } }));
    const response = await call('/api/me/follows', { session: 'tok_expired_abcdefghijklmnopqrstu' });
    expect(apiCalls[0]!.headers.authorization).toBe(`Bearer ${CITIZEN}`);
    const cookie = authCookie(response);
    expect(cookie).toContain(`${AUTH_COOKIE}=${CITIZEN}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    // Never cache a response that sets a session cookie.
    expect(response.headers.get('cache-control')).toMatch(/no-store/);
  });
});

describe('BFF proxy: what a 401 does to the session', () => {
  it('signs out of Supabase on this device when the API says unauthorized', async () => {
    mockApi(() => ({ status: 401, body: { error: 'unauthorized' } }));
    const response = await call('/api/me/follows', { session: CITIZEN });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
    expect(fake.calls.find((c) => c.method === 'signOut')?.args).toEqual({ scope: 'local' });
    expect(authCookie(response)).toMatch(/Max-Age=0/);
  });

  it('keeps the session on 401 mfa_required and relays the code, so the console asks for TOTP again', async () => {
    mockApi(() => ({ status: 401, body: { error: 'mfa_required' } }));
    const response = await call('/api/staff/moderation', { session: CITIZEN });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'mfa_required' });
    expect(fake.calls.some((c) => c.method === 'signOut')).toBe(false);
    expect(authCookie(response)).toBe('');
  });

  it('treats a CSV download the same way: mfa_required keeps the session, unauthorized ends it', async () => {
    mockApi(() => new Response(JSON.stringify({ error: 'mfa_required' }), { status: 401, headers: { 'content-type': 'application/json' } }));
    const stale = await call('/api/staff/export/queue.csv', { session: STAFF });
    expect(stale.status).toBe(401);
    expect(await stale.json()).toEqual({ error: 'mfa_required' });
    expect(fake.calls.some((c) => c.method === 'signOut')).toBe(false);

    mockApi(() => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } }));
    const gone = await call('/api/staff/export/queue.csv', { session: STAFF });
    expect(gone.status).toBe(401);
    expect(fake.calls.some((c) => c.method === 'signOut')).toBe(true);
    expect(authCookie(gone)).toMatch(/Max-Age=0/);
  });

  it('keeps the session on 403 not_staff (a citizen trying the console)', async () => {
    mockApi(() => ({ status: 403, body: { error: 'not_staff' } }));
    const response = await call('/api/staff/me', { session: CITIZEN });
    expect(response.status).toBe(403);
    expect(fake.calls.some((c) => c.method === 'signOut')).toBe(false);
  });

  it('signs out after the account is deleted (US-34)', async () => {
    mockApi(() => ({ status: 204 }));
    const response = await call('/api/me', { method: 'DELETE', session: CITIZEN });
    expect(response.status).toBe(204);
    expect(authCookie(response)).toMatch(/Max-Age=0/);
  });
});

describe('BFF proxy: allowlist and request checks', () => {
  it('refuses endpoints outside the allowlist, the old sign-in endpoints and malformed IDs', async () => {
    mockApi(() => ({ status: 200, body: {} }));
    for (const [method, path] of [
      ['POST', '/api/auth/verify'],
      ['POST', '/api/auth/code'],
      ['POST', '/api/auth/sign-in'],
      ['POST', '/api/staff/auth/verify'],
      ['POST', '/api/staff/auth/totp'],
      ['POST', '/api/staff/auth/logout'],
      ['GET', '/api/admin/reports'],
      ['GET', '/api/reports'],
      ['DELETE', `/api/staff/reports/${ID}`],
      ['POST', '/api/staff/accounts/abc/ban'],
      ['GET', '/api/forwarded/short'],
    ] as const) {
      expect((await call(path, { method, session: STAFF, ...(method === 'GET' || method === 'DELETE' ? {} : { body: {} }) })).status, `${method} ${path}`).toBe(404);
    }
    expect((await proxy(request('/api/public/reports/x'), ['public', 'reports', '..'])).status).toBe(404);
    expect(apiCalls).toHaveLength(0);
    expect(matchRule('GET', 'public/reports/be-nk-2026-0112')).toBeNull();
    expect(matchRule('POST', `comments/${UUID}/flag`)?.auth).toBe('citizen');
  });

  it('knows every console route as a staff route', () => {
    for (const [method, path] of [
      ['GET', 'staff/me'],
      ['GET', 'staff/reports'],
      ['PATCH', `staff/reports/${ID}/status`],
      ['PUT', `staff/reports/${ID}/override`],
      ['POST', `staff/reports/${ID}/forward`],
      ['POST', `staff/reports/${ID}/merge`],
      ['POST', `staff/reports/${ID}/spike`],
      ['GET', 'staff/moderation'],
      ['PATCH', `staff/comments/${UUID}`],
      ['POST', `staff/accounts/${UUID}/ban`],
      ['GET', 'staff/tenants'],
      ['PATCH', `staff/tenants/${UUID}`],
      ['PUT', `staff/tenants/${UUID}/settings`],
      ['GET', `staff/tenants/${UUID}/contacts`],
      ['POST', `staff/tenants/${UUID}/contacts`],
      ['DELETE', `staff/tenants/${UUID}/contacts/${UUID}`],
      ['GET', `staff/tenants/${UUID}/staff`],
      ['POST', `staff/tenants/${UUID}/staff`],
      ['DELETE', `staff/tenants/${UUID}/staff/${UUID}`],
    ] as const) {
      expect(matchRule(method, path)?.auth, `${method} ${path}`).toBe('staff');
    }
  });

  it('passes the queue filters on and drops everything else', async () => {
    mockApi(() => ({ status: 200, body: { reports: [] } }));
    const qs = `status=open&level=Critical&category=pothole&tenantId=${UUID}&maxAgeDays=7&sort=age&limit=50&offset=50&lat=1&evil=1`;
    await call(`/api/staff/reports?${qs}`, { session: STAFF });
    expect(apiCalls[0]!.url).toBe(`http://api.test/staff/reports?status=open&level=Critical&category=pothole&tenantId=${UUID}&maxAgeDays=7&sort=age&limit=50&offset=50`);
    await call(`/api/staff/reports/${ID}?status=open`, { session: STAFF });
    expect(apiCalls[1]!.url).toBe(`http://api.test/staff/reports/${ID}`);
  });

  it('refuses cross-site requests (CSRF) before looking at the session', async () => {
    mockApi(() => ({ status: 200, body: {} }));
    const fromElsewhere = await call(`/api/reports/${ID}/follow`, {
      method: 'PUT',
      session: CITIZEN,
      headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' },
    });
    expect(fromElsewhere.status).toBe(403);
    const wrongOrigin = await call(`/api/staff/reports/${ID}/status`, { method: 'PATCH', body: { status: 'resolved' }, session: STAFF, headers: { origin: 'https://evil.example' } });
    expect(wrongOrigin.status).toBe(403);
    expect(apiCalls).toHaveLength(0);
    expect(fake.created).toHaveLength(0);
  });

  it('refuses bodies over 64 KB and bodies that are not JSON', async () => {
    mockApi(() => ({ status: 200, body: {} }));
    const big = await call(`/api/reports/${ID}/comments`, { method: 'POST', body: { body: 'x'.repeat(70 * 1024) }, session: CITIZEN });
    expect(big.status).toBe(413);
    const broken = new NextRequest(`http://localhost:3000/api/reports/${ID}/comments`, {
      method: 'POST',
      headers: { host: 'localhost:3000', cookie: `${AUTH_COOKIE}=${CITIZEN}`, 'content-type': 'application/json' },
      body: '{nope',
    });
    expect((await proxy(broken, ['reports', ID, 'comments'])).status).toBe(400);
    expect(apiCalls).toHaveLength(0);
  });

  it('turns an unreachable API into 502 unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    const response = await call('/api/public/route?lat=52.5&lon=13.4');
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'unavailable' });
  });
});
