// @vitest-environment node
// Staff side of the backend-for-frontend: TOTP sign-in, the staff cookie, and which token each route gets.
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy as consoleProxy, config as proxyConfig } from '@/proxy';
import { safeConsoleNext } from '@/lib/console-paths';
import { matchRule, proxy, SESSION_COOKIE, STAFF_CHALLENGE_COOKIE, STAFF_COOKIE } from './bff';
import { getStaffSession, postStaffLogout, postStaffTotp, postStaffVerify } from './staff-auth-handlers';

const CITIZEN = 'cit_abcdefghijklmnopqrstuvwxyz0123456789';
const STAFF = 'stf_abcdefghijklmnopqrstuvwxyz0123456789';
const CHALLENGE = 'chl_0123456789abcdef0123456789abcdef';
const ID = 'BE-NK-2026-0112';
const UUID = '0b6f3f3e-6c43-4a8e-9f62-6a1f1b1f2c3d';

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

function request(
  path: string,
  init: { method?: string; body?: unknown; citizen?: string; staff?: string; challenge?: string; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = { host: 'localhost:3000', ...init.headers };
  const cookies = [
    init.citizen ? `${SESSION_COOKIE}=${init.citizen}` : null,
    init.staff ? `${STAFF_COOKIE}=${init.staff}` : null,
    init.challenge ? `${STAFF_CHALLENGE_COOKIE}=${init.challenge}` : null,
  ].filter(Boolean);
  if (cookies.length) headers.cookie = cookies.join('; ');
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(`http://localhost:3000${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

const setCookies = (response: Response) => response.headers.getSetCookie();
const cookieNamed = (response: Response, name: string) => setCookies(response).find((c) => c.startsWith(`${name}=`)) ?? '';

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.test');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('staff sign-in: email code, then TOTP (ENG-09)', () => {
  it('keeps the challenge in an httpOnly cookie for the TOTP step and tells the browser only the next step', async () => {
    mockApi(() => ({ status: 200, body: { challenge: CHALLENGE, next: 'totp' } }));
    const response = await postStaffVerify(request('/api/staff/auth/verify', { method: 'POST', body: { email: 'cw@neukoelln.de', code: '123456' } }));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(CHALLENGE);
    expect(JSON.parse(text)).toEqual({ next: 'totp' });
    expect(apiCalls[0]).toMatchObject({ url: 'http://api.test/staff/auth/verify', method: 'POST', body: JSON.stringify({ email: 'cw@neukoelln.de', code: '123456' }) });
    const cookie = cookieNamed(response, STAFF_CHALLENGE_COOKIE);
    expect(cookie).toContain(CHALLENGE);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=strict/i);
    expect(cookie).toMatch(/Path=\/api\/staff\/auth/);
    expect(cookie).toMatch(/Max-Age=600/);
  });

  it('passes the otpauth URI and secret on the first sign-in, for the QR code', async () => {
    const otpauthUri = 'otpauth://totp/Kiezruf:cw%40neukoelln.de?secret=JBSWY3DPEHPK3PXP&issuer=Kiezruf';
    mockApi(() => ({ status: 200, body: { challenge: CHALLENGE, next: 'enroll', otpauthUri, secret: 'JBSWY3DPEHPK3PXP' } }));
    const response = await postStaffVerify(request('/api/staff/auth/verify', { method: 'POST', body: { email: 'cw@neukoelln.de', code: '123456' } }));
    expect(await response.json()).toEqual({ next: 'enroll', otpauthUri, secret: 'JBSWY3DPEHPK3PXP' });
  });

  it('relays not_staff and sets no cookie', async () => {
    mockApi(() => ({ status: 403, body: { error: 'not_staff' } }));
    const response = await postStaffVerify(request('/api/staff/auth/verify', { method: 'POST', body: { email: 'citizen@example.org', code: '123456' } }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'not_staff' });
    expect(setCookies(response)).toEqual([]);
  });

  it('sets the staff cookie (httpOnly, Secure, SameSite=Strict, expiring with the token) and never returns the token', async () => {
    // The token's expiry must lie in the future, or the 12-hour fallback applies.
    vi.useFakeTimers({ now: new Date('2026-11-11T23:00:00.000Z'), toFake: ['Date'] });
    mockApi(() => ({ status: 200, body: { token: STAFF, expiresAt: '2026-11-12T11:00:00.000Z' } }));
    const response = await postStaffTotp(request('/api/staff/auth/totp', { method: 'POST', body: { totp: '654321' }, challenge: CHALLENGE }));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(STAFF);
    expect(JSON.parse(text)).toEqual({ signedIn: true });
    expect(apiCalls[0]).toMatchObject({ url: 'http://api.test/staff/auth/totp', body: JSON.stringify({ challenge: CHALLENGE, totp: '654321' }) });
    const cookie = cookieNamed(response, STAFF_COOKIE);
    expect(cookie).toContain(`${STAFF_COOKIE}=${STAFF}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=strict/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Expires=Thu, 12 Nov 2026 11:00:00 GMT/);
    // The citizen cookie is not touched; the challenge is used up.
    expect(cookieNamed(response, SESSION_COOKIE)).toBe('');
    expect(cookieNamed(response, STAFF_CHALLENGE_COOKIE)).toMatch(/Max-Age=0/);
  });

  it('expires the cookie after 12 hours when the API sends no expiry', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-11T08:00:00.000Z'), toFake: ['Date'] });
    mockApi(() => ({ status: 200, body: { token: STAFF } }));
    const response = await postStaffTotp(request('/api/staff/auth/totp', { method: 'POST', body: { totp: '654321' }, challenge: CHALLENGE }));
    expect(cookieNamed(response, STAFF_COOKIE)).toMatch(/Expires=Wed, 11 Nov 2026 20:00:00 GMT/);
  });

  it('keeps the challenge after a wrong code and asks to start again without one', async () => {
    mockApi(() => ({ status: 400, body: { error: 'invalid_totp' } }));
    const wrong = await postStaffTotp(request('/api/staff/auth/totp', { method: 'POST', body: { totp: '000000' }, challenge: CHALLENGE }));
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ error: 'invalid_totp' });
    expect(setCookies(wrong)).toEqual([]);

    const none = await postStaffTotp(request('/api/staff/auth/totp', { method: 'POST', body: { totp: '000000' } }));
    expect(await none.json()).toEqual({ error: 'challenge_expired' });
    const malformed = await postStaffTotp(request('/api/staff/auth/totp', { method: 'POST', body: { totp: '12ab' }, challenge: CHALLENGE }));
    expect(await malformed.json()).toEqual({ error: 'invalid_totp' });
    expect(apiCalls).toHaveLength(1);
  });

  it('drops the challenge when the API says it expired', async () => {
    mockApi(() => ({ status: 400, body: { error: 'challenge_expired' } }));
    const response = await postStaffTotp(request('/api/staff/auth/totp', { method: 'POST', body: { totp: '654321' }, challenge: CHALLENGE }));
    expect(cookieNamed(response, STAFF_CHALLENGE_COOKIE)).toMatch(/Max-Age=0/);
  });

  it('signs out at the API with the staff token and clears only the staff cookie', async () => {
    mockApi(() => ({ status: 204 }));
    const response = await postStaffLogout(request('/api/staff/auth/logout', { method: 'POST', staff: STAFF, citizen: CITIZEN }));
    expect(apiCalls[0]).toMatchObject({ url: 'http://api.test/staff/auth/logout', method: 'POST' });
    expect(apiCalls[0]!.headers.authorization).toBe(`Bearer ${STAFF}`);
    expect(cookieNamed(response, STAFF_COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(cookieNamed(response, SESSION_COOKIE)).toBe('');
  });

  it('reports the staff member and grants, and drops a cookie the API no longer accepts', async () => {
    const me = { id: 'acc-1', email: 'cw@neukoelln.de', grants: [{ tenantId: UUID, tenantName: 'Neukölln', path: 'de.be.bec.nk', role: 'case_worker' }] };
    mockApi(() => ({ status: 200, body: me }));
    const ok = await getStaffSession(request('/api/staff/session', { staff: STAFF, citizen: CITIZEN }));
    expect(await ok.json()).toEqual({ signedIn: true, me });
    expect(apiCalls[0]).toMatchObject({ url: 'http://api.test/staff/me' });
    expect(apiCalls[0]!.headers.authorization).toBe(`Bearer ${STAFF}`);

    mockApi(() => ({ status: 401, body: { error: 'unauthorized' } }));
    const gone = await getStaffSession(request('/api/staff/session', { staff: STAFF }));
    expect(await gone.json()).toEqual({ signedIn: false });
    expect(cookieNamed(gone, STAFF_COOKIE)).toMatch(/Max-Age=0/);

    mockApi(() => ({ status: 200, body: me }));
    const citizenOnly = await getStaffSession(request('/api/staff/session', { citizen: CITIZEN }));
    expect(await citizenOnly.json()).toEqual({ signedIn: false });
    expect(apiCalls).toHaveLength(0);
  });

  it('refuses cross-site sign-in requests', async () => {
    mockApi(() => ({ status: 200, body: {} }));
    const response = await postStaffTotp(
      request('/api/staff/auth/totp', { method: 'POST', body: { totp: '654321' }, challenge: CHALLENGE, headers: { origin: 'https://evil.example' } }),
    );
    expect(response.status).toBe(403);
    expect(apiCalls).toHaveLength(0);
  });
});

describe('BFF proxy: staff routes get the staff token only', () => {
  it('sends the staff token, never the citizen token, to /staff/* routes', async () => {
    mockApi(() => ({ status: 200, body: { reports: [] } }));
    await proxy(request('/api/staff/reports', { staff: STAFF, citizen: CITIZEN }), ['staff', 'reports']);
    expect(apiCalls[0]!.headers.authorization).toBe(`Bearer ${STAFF}`);
  });

  it('answers 401 for a staff route with only a citizen session, without calling the API', async () => {
    mockApi(() => ({ status: 200, body: {} }));
    const response = await proxy(request(`/api/staff/reports/${ID}`, { citizen: CITIZEN }), ['staff', 'reports', ID]);
    expect(response.status).toBe(401);
    expect(apiCalls).toHaveLength(0);
  });

  it('keeps citizen routes on the citizen token, even for a signed-in staff member', async () => {
    mockApi(() => ({ status: 200, body: { reports: [] } }));
    const staffOnly = await proxy(request('/api/me/reports', { staff: STAFF }), ['me', 'reports']);
    expect(staffOnly.status).toBe(401);
    expect(apiCalls).toHaveLength(0);
    await proxy(request('/api/me/reports', { staff: STAFF, citizen: CITIZEN }), ['me', 'reports']);
    expect(apiCalls[0]!.headers.authorization).toBe(`Bearer ${CITIZEN}`);
  });

  it('passes the queue filters on and drops everything else', async () => {
    mockApi(() => ({ status: 200, body: { reports: [] } }));
    const qs = `status=open&level=Critical&category=pothole&tenantId=${UUID}&maxAgeDays=7&sort=age&limit=50&offset=50&lat=1&evil=1`;
    await proxy(request(`/api/staff/reports?${qs}`, { staff: STAFF }), ['staff', 'reports']);
    expect(apiCalls[0]!.url).toBe(`http://api.test/staff/reports?status=open&level=Critical&category=pothole&tenantId=${UUID}&maxAgeDays=7&sort=age&limit=50&offset=50`);
    // Other staff routes take no query at all.
    await proxy(request(`/api/staff/reports/${ID}?status=open`, { staff: STAFF }), ['staff', 'reports', ID]);
    expect(apiCalls[1]!.url).toBe(`http://api.test/staff/reports/${ID}`);
  });

  it('forwards the console actions with their bodies', async () => {
    mockApi(() => ({ status: 200, body: { ok: true } }));
    const body = { status: 'rejected', reason: 'Private ground', publicNote: 'Not public land.' };
    await proxy(request(`/api/staff/reports/${ID}/status`, { method: 'PATCH', body, staff: STAFF }), ['staff', 'reports', ID, 'status']);
    expect(apiCalls[0]).toMatchObject({ url: `http://api.test/staff/reports/${ID}/status`, method: 'PATCH', body: JSON.stringify(body) });
    for (const [method, path] of [
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

  it('clears the staff cookie, not the citizen cookie, when a staff call answers 401', async () => {
    mockApi(() => ({ status: 401, body: { error: 'unauthorized' } }));
    const response = await proxy(request('/api/staff/moderation', { staff: STAFF, citizen: CITIZEN }), ['staff', 'moderation']);
    expect(response.status).toBe(401);
    expect(cookieNamed(response, STAFF_COOKIE)).toMatch(/Max-Age=0/);
    expect(cookieNamed(response, SESSION_COOKIE)).toBe('');
  });

  it('opens forward links without any token (US-45)', async () => {
    mockApi(() => ({ status: 410, body: { error: 'link_expired' } }));
    const token = 'fwd_0123456789abcdefghij';
    const response = await proxy(request(`/api/forwarded/${token}`, { staff: STAFF, citizen: CITIZEN }), ['forwarded', token]);
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: 'link_expired' });
    expect(apiCalls[0]!.url).toBe(`http://api.test/forwarded/${token}`);
    expect(apiCalls[0]!.headers.authorization).toBeUndefined();
  });

  it('refuses sign-in, unknown staff paths and malformed IDs through the catch-all', async () => {
    mockApi(() => ({ status: 200, body: {} }));
    expect((await proxy(request('/api/staff/auth/verify', { method: 'POST', body: {} }), ['staff', 'auth', 'verify'])).status).toBe(404);
    expect((await proxy(request('/api/staff/auth/totp', { method: 'POST', body: {} }), ['staff', 'auth', 'totp'])).status).toBe(404);
    expect((await proxy(request('/api/staff/reports/x', { method: 'DELETE', staff: STAFF }), ['staff', 'reports', ID])).status).toBe(404);
    expect((await proxy(request('/api/staff/accounts/x/ban', { method: 'POST', staff: STAFF }), ['staff', 'accounts', 'abc', 'ban'])).status).toBe(404);
    expect((await proxy(request('/api/forwarded/x'), ['forwarded', 'short'])).status).toBe(404);
    expect(apiCalls).toHaveLength(0);
  });

  it('refuses cross-site requests to staff routes (CSRF)', async () => {
    mockApi(() => ({ status: 200, body: {} }));
    const fromElsewhere = request(`/api/staff/reports/${ID}/status`, {
      method: 'PATCH',
      body: { status: 'resolved' },
      staff: STAFF,
      headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' },
    });
    expect((await proxy(fromElsewhere, ['staff', 'reports', ID, 'status'])).status).toBe(403);
    expect(apiCalls).toHaveLength(0);
  });
});

describe('console pages without a staff session go to sign-in (src/proxy.ts)', () => {
  it('redirects /console pages without the staff cookie, keeping where they were going', () => {
    const response = consoleProxy(request(`/console/reports/${ID}?x=1`, { citizen: CITIZEN }));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/console/sign-in');
    expect(location.searchParams.get('next')).toBe(`/console/reports/${ID}?x=1`);
  });

  it('lets the sign-in page and signed-in staff through', () => {
    expect(consoleProxy(request('/console/sign-in')).headers.get('location')).toBeNull();
    expect(consoleProxy(request('/console', { staff: STAFF })).headers.get('location')).toBeNull();
    expect(proxyConfig.matcher).toEqual(['/console', '/console/:path*']);
  });

  it('only ever sends staff back to a console page after sign-in', () => {
    expect(safeConsoleNext('/console/tenants')).toBe('/console/tenants');
    expect(safeConsoleNext('/console?level=Critical')).toBe('/console?level=Critical');
    for (const bad of ['https://evil.example', '//evil.example/console', '/consolex', '/console//evil', '/console\\evil', '/console/sign-in', null, '']) {
      expect(safeConsoleNext(bad)).toBe('/console');
    }
  });
});
