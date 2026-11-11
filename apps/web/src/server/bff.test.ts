// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSession, postAuthLogout, postAuthVerify } from './auth-handlers';
import { matchRule, proxy, SESSION_COOKIE } from './bff';

const TOKEN = 'tok_abcdefghijklmnopqrstuvwxyz0123456789';

interface ApiCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

let apiCalls: ApiCall[];

function mockApi(answer: (call: ApiCall) => { status: number; body?: unknown }) {
  apiCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const call = { url, method: init.method ?? 'GET', headers: init.headers as Record<string, string>, body: init.body as string | undefined };
      apiCalls.push(call);
      const { status, body } = answer(call);
      return new Response(body === undefined ? null : JSON.stringify(body), { status });
    }),
  );
}

function request(path: string, init: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { host: 'localhost:3000', ...init.headers };
  if (init.cookie) headers.cookie = `${SESSION_COOKIE}=${init.cookie}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(`http://localhost:3000${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.test');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('BFF sign-in: the token goes into an httpOnly cookie, never to the browser', () => {
  it('sets an httpOnly, Secure, SameSite=Lax session cookie and leaves the token out of the body', async () => {
    mockApi(() => ({ status: 200, body: { token: TOKEN, expiresAt: '2026-12-11T12:00:00.000Z', newAccount: true } }));
    const response = await postAuthVerify(request('/api/auth/verify', { method: 'POST', body: { email: 'a@example.org', code: '123456', locale: 'de' } }));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(TOKEN);
    expect(JSON.parse(text)).toEqual({ signedIn: true, newAccount: true });
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`${SESSION_COOKIE}=${TOKEN}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Expires=Fri, 11 Dec 2026/);
    expect(apiCalls[0]).toMatchObject({ url: 'http://api.test/auth/verify', method: 'POST' });
  });

  it('passes a wrong code through as the API error and sets no cookie', async () => {
    mockApi(() => ({ status: 400, body: { error: 'invalid_code' } }));
    const response = await postAuthVerify(request('/api/auth/verify', { method: 'POST', body: { email: 'a@example.org', code: '000000' } }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_code' });
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('signs out at the API and clears the cookie', async () => {
    mockApi(() => ({ status: 204 }));
    const response = await postAuthLogout(request('/api/auth/logout', { method: 'POST', cookie: TOKEN }));
    expect(apiCalls[0]).toMatchObject({ url: 'http://api.test/auth/logout', method: 'POST' });
    expect(apiCalls[0]!.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(response.headers.get('set-cookie')).toMatch(new RegExp(`${SESSION_COOKIE}=;.*Expires=Thu, 01 Jan 1970`, 'i'));
  });

  it('reports the session without the token, and drops a cookie the API no longer accepts', async () => {
    mockApi(() => ({ status: 200, body: { id: 'acc-1', email: 'a@example.org', locale: 'en', createdAt: '2026-11-01T00:00:00Z' } }));
    const ok = await getSession(request('/api/session', { cookie: TOKEN }));
    expect(await ok.json()).toEqual({ signedIn: true, email: 'a@example.org', locale: 'en' });

    mockApi(() => ({ status: 401, body: { error: 'unauthorized' } }));
    const gone = await getSession(request('/api/session', { cookie: TOKEN }));
    expect(await gone.json()).toEqual({ signedIn: false });
    expect(gone.headers.get('set-cookie')).toMatch(new RegExp(`${SESSION_COOKIE}=;`));

    mockApi(() => ({ status: 500 }));
    const guest = await getSession(request('/api/session'));
    expect(await guest.json()).toEqual({ signedIn: false });
    expect(apiCalls).toHaveLength(0);
  });
});

describe('BFF proxy', () => {
  it('adds the bearer token from the cookie to citizen endpoints', async () => {
    mockApi(() => ({ status: 200, body: { voted: true, meTooCount: 3 } }));
    const body = { lat: 52.48, lon: 13.43, accuracyM: 12 };
    const response = await proxy(request('/api/reports/BE-NK-2026-0112/me-too', { method: 'PUT', body, cookie: TOKEN }), ['reports', 'BE-NK-2026-0112', 'me-too']);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ voted: true, meTooCount: 3 });
    expect(apiCalls[0]).toMatchObject({ url: 'http://api.test/reports/BE-NK-2026-0112/me-too', method: 'PUT', body: JSON.stringify(body) });
    expect(apiCalls[0]!.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('answers 401 without calling the API when a citizen endpoint has no cookie', async () => {
    mockApi(() => ({ status: 200, body: {} }));
    const response = await proxy(request('/api/me/reports'), ['me', 'reports']);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
    expect(apiCalls).toHaveLength(0);
  });

  it('keeps public browsing anonymous: no token, only known query parameters', async () => {
    mockApi(() => ({ status: 200, body: { reports: [] } }));
    await proxy(request('/api/public/reports?lat=52.5&lon=13.4&status=open&evil=1', { cookie: TOKEN }), ['public', 'reports']);
    expect(apiCalls[0]!.url).toBe('http://api.test/public/reports?lat=52.5&lon=13.4&status=open');
    expect(apiCalls[0]!.headers.authorization).toBeUndefined();
  });

  it('clears the cookie when the API says the session is gone', async () => {
    mockApi(() => ({ status: 401, body: { error: 'unauthorized' } }));
    const response = await proxy(request('/api/me/follows', { cookie: TOKEN }), ['me', 'follows']);
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toMatch(new RegExp(`${SESSION_COOKIE}=;`));
  });

  it('clears the cookie after the account is deleted (US-34)', async () => {
    mockApi(() => ({ status: 204 }));
    const response = await proxy(request('/api/me', { method: 'DELETE', cookie: TOKEN }), ['me']);
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toMatch(new RegExp(`${SESSION_COOKIE}=;`));
  });

  it('refuses endpoints outside the allowlist and malformed IDs', async () => {
    mockApi(() => ({ status: 200, body: {} }));
    expect((await proxy(request('/api/auth/verify', { method: 'POST', body: {} }), ['auth', 'verify'])).status).toBe(404);
    expect((await proxy(request('/api/admin/reports', { cookie: TOKEN }), ['admin', 'reports'])).status).toBe(404);
    expect((await proxy(request('/api/public/reports/x', {}), ['public', 'reports', '..'])).status).toBe(404);
    expect((await proxy(request('/api/reports', { method: 'GET', cookie: TOKEN }), ['reports'])).status).toBe(404);
    expect(apiCalls).toHaveLength(0);
    expect(matchRule('GET', 'public/reports/be-nk-2026-0112')).toBeNull();
    expect(matchRule('POST', 'comments/0b6f3f3e-6c43-4a8e-9f62-6a1f1b1f2c3d/flag')).not.toBeNull();
  });

  it('refuses cross-site requests (CSRF)', async () => {
    mockApi(() => ({ status: 200, body: {} }));
    const fromElsewhere = request('/api/reports/BE-NK-2026-0112/follow', {
      method: 'PUT',
      cookie: TOKEN,
      headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' },
    });
    expect((await proxy(fromElsewhere, ['reports', 'BE-NK-2026-0112', 'follow'])).status).toBe(403);
    const wrongOrigin = request('/api/me', { method: 'DELETE', cookie: TOKEN, headers: { origin: 'https://evil.example' } });
    expect((await proxy(wrongOrigin, ['me'])).status).toBe(403);
    expect(apiCalls).toHaveLength(0);
  });

  it('turns an unreachable API into 502 unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    const response = await proxy(request('/api/public/route?lat=52.5&lon=13.4'), ['public', 'route']);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'unavailable' });
  });
});
