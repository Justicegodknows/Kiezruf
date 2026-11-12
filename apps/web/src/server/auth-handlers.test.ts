// @vitest-environment node
// Sign-in through Supabase Auth on the server (ENG-22): email code, verify, MFA enrolment and verification,
// sign-out, and the session answers for the UI. Supabase is a fake (src/test/fake-supabase.ts).
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_COOKIE, fake, stubSupabaseEnv, SVG } from '@/test/fake-supabase';
import { getSession, getStaffSession, postAuthCode, postAuthLogout, postAuthVerify, postMfaStart, postMfaVerify, qrDataUrl } from './auth-handlers';
import { authCookieOptions, authErrorCode } from './supabase';

vi.mock('@supabase/ssr', async () => (await import('@/test/fake-supabase')).ssrModule);

const AAL1 = 'tok_aal1_abcdefghijklmnopqrstuvwxyz';
const AAL2 = 'tok_aal2_abcdefghijklmnopqrstuvwxyz';

interface ApiCall {
  url: string;
  headers: Record<string, string>;
}
let apiCalls: ApiCall[];

function mockApi(answer: (call: ApiCall) => { status: number; body?: unknown }) {
  apiCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const call = { url, headers: init.headers as Record<string, string> };
      apiCalls.push(call);
      const { status, body } = answer(call);
      return new Response(body === undefined ? null : JSON.stringify(body), { status });
    }),
  );
}

function request(path: string, init: { method?: string; body?: unknown; session?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { host: 'localhost:3000', ...init.headers };
  if (init.session) headers.cookie = `${AUTH_COOKIE}=${init.session}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(`http://localhost:3000${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

const authCookie = (response: Response) => response.headers.getSetCookie().find((c) => c.startsWith(`${AUTH_COOKIE}=`)) ?? '';
const calledWith = (method: string) => fake.calls.filter((c) => c.method === method).map((c) => c.args);

beforeEach(() => {
  fake.reset();
  fake.tokens[AAL1] = { aal: 'aal1' };
  fake.tokens[AAL2] = { aal: 'aal2', totpAt: Math.floor(Date.now() / 1000) - 60 };
  stubSupabaseEnv(vi.stubEnv);
  mockApi(() => ({ status: 500 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('email code (US-01): signInWithOtp, then verifyOtp', () => {
  it('asks Supabase to send the code, creating the account for a new address', async () => {
    const response = await postAuthCode(request('/api/auth/code', { body: { email: '  A@Example.org ', locale: 'en' } }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ sent: true });
    expect(calledWith('signInWithOtp')).toEqual([{ email: 'a@example.org', options: { shouldCreateUser: true, data: { locale: 'en' } } }]);
  });

  it('refuses a malformed address without calling Supabase', async () => {
    const response = await postAuthCode(request('/api/auth/code', { body: { email: 'not-an-address' } }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_request' });
    expect(fake.calls).toHaveLength(0);
  });

  it('translates Supabase rate limits into the app codes', async () => {
    fake.errors.signInWithOtp = { code: 'over_email_send_rate_limit', status: 429 };
    const tooMany = await postAuthCode(request('/api/auth/code', { body: { email: 'a@example.org' } }));
    expect(tooMany.status).toBe(429);
    expect(await tooMany.json()).toEqual({ error: 'too_many_codes' });
    fake.errors.signInWithOtp = { code: 'over_request_rate_limit', status: 429 };
    expect(await (await postAuthCode(request('/api/auth/code', { body: { email: 'a@example.org' } }))).json()).toEqual({ error: 'rate_limited' });
  });

  it('verifies the code with type email; the session goes into an httpOnly cookie, never into the body', async () => {
    const response = await postAuthVerify(request('/api/auth/verify', { body: { email: 'a@example.org', code: '123456' } }));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain('tok_');
    expect(JSON.parse(text)).toEqual({ signedIn: true, aal: 'aal1' });
    expect(calledWith('verifyOtp')).toEqual([{ email: 'a@example.org', token: '123456', type: 'email' }]);
    const cookie = authCookie(response);
    expect(cookie).toContain(`${AUTH_COOKIE}=tok_aal1_fresh_session_token`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//);
    // Not Secure outside production, so Safari keeps it on http://localhost.
    expect(cookie).not.toMatch(/Secure/i);
  });

  it('answers a wrong or expired code with invalid_code and sets no cookie', async () => {
    const response = await postAuthVerify(request('/api/auth/verify', { body: { email: 'a@example.org', code: '000000' } }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_code' });
    expect(authCookie(response)).toBe('');
    const malformed = await postAuthVerify(request('/api/auth/verify', { body: { email: 'a@example.org', code: '12ab' } }));
    expect(await malformed.json()).toEqual({ error: 'invalid_code' });
  });

  it('refuses cross-site sign-in requests and answers 503 without Supabase settings', async () => {
    const crossSite = await postAuthVerify(request('/api/auth/verify', { body: { email: 'a@example.org', code: '123456' }, headers: { origin: 'https://evil.example' } }));
    expect(crossSite.status).toBe(403);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    const unconfigured = await postAuthCode(request('/api/auth/code', { body: { email: 'a@example.org' } }));
    expect(unconfigured.status).toBe(503);
    expect(await unconfigured.json()).toEqual({ error: 'unavailable' });
    expect(fake.calls).toHaveLength(0);
  });

  it('signs out on this device only and clears the cookie', async () => {
    const response = await postAuthLogout(request('/api/auth/logout', { method: 'POST', session: AAL1 }));
    expect(await response.json()).toEqual({ signedIn: false });
    expect(calledWith('signOut')).toEqual([{ scope: 'local' }]);
    expect(authCookie(response)).toMatch(/Max-Age=0/);
  });
});

describe('console MFA: enrol the first time, then challenge and verify', () => {
  it('enrols a TOTP factor without one and answers with the QR code and the secret', async () => {
    const response = await postMfaStart(request('/api/auth/mfa', { method: 'POST', session: AAL1 }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ next: 'enroll', qrCode: expect.stringMatching(/^data:image\/svg\+xml;base64,/), secret: 'JBSWY3DPEHPK3PXP' });
    // The SVG survives intact (a raw `#` in a data URL would cut it off).
    expect(Buffer.from(body.qrCode.split(',')[1], 'base64').toString('utf8')).toBe(SVG);
    expect(calledWith('enroll')).toEqual([{ factorType: 'totp', friendlyName: expect.stringMatching(/^Kiezruf /) }]);
  });

  it('drops a factor left unverified by an earlier attempt before enrolling again', async () => {
    fake.factors = [{ id: 'factor-old', factor_type: 'totp', status: 'unverified', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z' }];
    await postMfaStart(request('/api/auth/mfa', { method: 'POST', session: AAL1 }));
    expect(calledWith('unenroll')).toEqual([{ factorId: 'factor-old' }]);
    expect(calledWith('enroll')).toHaveLength(1);
  });

  it('only asks for the code when a verified factor exists', async () => {
    fake.factors = [{ id: 'factor-1', factor_type: 'totp', status: 'verified', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z' }];
    const response = await postMfaStart(request('/api/auth/mfa', { method: 'POST', session: AAL1 }));
    expect(await response.json()).toEqual({ next: 'totp' });
    expect(calledWith('enroll')).toHaveLength(0);
  });

  it('needs a session for the MFA step', async () => {
    const response = await postMfaStart(request('/api/auth/mfa', { method: 'POST' }));
    expect(response.status).toBe(401);
    expect(fake.calls.some((c) => c.method === 'enroll')).toBe(false);
  });

  it('verifies the first code against the factor being enrolled; the session becomes aal2', async () => {
    await postMfaStart(request('/api/auth/mfa', { method: 'POST', session: AAL1 }));
    const response = await postMfaVerify(request('/api/auth/mfa/verify', { body: { code: '654321' }, session: AAL1 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ signedIn: true, aal: 'aal2' });
    expect(calledWith('challenge')).toEqual([{ factorId: 'factor-new' }]);
    expect(calledWith('verify')).toEqual([{ factorId: 'factor-new', challengeId: 'challenge-1', code: '654321' }]);
    expect(authCookie(response)).toContain(`${AUTH_COOKIE}=tok_aal2_fresh_session_token`);
    expect(fake.factors[0]!.status).toBe('verified');
  });

  it('challenges the verified factor on later sign-ins and translates a wrong code', async () => {
    fake.factors = [{ id: 'factor-1', factor_type: 'totp', status: 'verified', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z' }];
    const wrong = await postMfaVerify(request('/api/auth/mfa/verify', { body: { code: '000000' }, session: AAL1 }));
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ error: 'invalid_totp' });
    expect(calledWith('challenge')).toEqual([{ factorId: 'factor-1' }]);
    const malformed = await postMfaVerify(request('/api/auth/mfa/verify', { body: { code: '12' }, session: AAL1 }));
    expect(await malformed.json()).toEqual({ error: 'invalid_totp' });
  });

  it('asks to start again when there is no factor to verify', async () => {
    const response = await postMfaVerify(request('/api/auth/mfa/verify', { body: { code: '654321' }, session: AAL1 }));
    expect(await response.json()).toEqual({ error: 'challenge_expired' });
  });
});

describe('session answers for the UI', () => {
  it('reports { signedIn, email, locale, aal } from GET /me with the access token', async () => {
    mockApi(() => ({ status: 200, body: { id: 'acc-1', email: 'a@example.org', locale: 'en' } }));
    const response = await getSession(request('/api/session', { session: AAL1 }));
    expect(await response.json()).toEqual({ signedIn: true, email: 'a@example.org', locale: 'en', aal: 'aal1' });
    expect(apiCalls[0]).toMatchObject({ url: 'http://api.test/me' });
    expect(apiCalls[0]!.headers.authorization).toBe(`Bearer ${AAL1}`);
  });

  it('is signed out without a session, and signs out a session the API refuses', async () => {
    expect(await (await getSession(request('/api/session'))).json()).toEqual({ signedIn: false });
    expect(apiCalls).toHaveLength(0);
    mockApi(() => ({ status: 401, body: { error: 'unauthorized' } }));
    const gone = await getSession(request('/api/session', { session: AAL1 }));
    expect(await gone.json()).toEqual({ signedIn: false });
    expect(authCookie(gone)).toMatch(/Max-Age=0/);
  });

  it('asks for the TOTP step when the session is only aal1, without calling the API', async () => {
    const response = await getStaffSession(request('/api/staff/session', { session: AAL1 }));
    expect(await response.json()).toEqual({ signedIn: false, reason: 'mfa_required' });
    expect(apiCalls).toHaveLength(0);
  });

  it('passes the staff member and grants on at aal2; mfa_required and not_staff keep the session', async () => {
    const grants = [{ tenantId: 't-nk', tenantName: 'Neukölln', path: 'de.be.bec.nk', role: 'case_worker' }];
    mockApi(() => ({ status: 200, body: { id: 'acc-1', email: 'cw@neukoelln.de', grants, preferences: { briefingEmail: true, other: 1 } } }));
    const ok = await getStaffSession(request('/api/staff/session', { session: AAL2 }));
    expect(await ok.json()).toEqual({ signedIn: true, me: { id: 'acc-1', email: 'cw@neukoelln.de', grants, preferences: { briefingEmail: true } } });
    expect(apiCalls[0]!.headers.authorization).toBe(`Bearer ${AAL2}`);

    mockApi(() => ({ status: 401, body: { error: 'mfa_required' } }));
    expect(await (await getStaffSession(request('/api/staff/session', { session: AAL2 }))).json()).toEqual({ signedIn: false, reason: 'mfa_required' });
    mockApi(() => ({ status: 403, body: { error: 'not_staff' } }));
    expect(await (await getStaffSession(request('/api/staff/session', { session: AAL2 }))).json()).toEqual({ signedIn: false, reason: 'not_staff' });
    expect(fake.calls.some((c) => c.method === 'signOut')).toBe(false);
  });
});

describe('Supabase helpers', () => {
  it('sets Secure on the session cookies in production only', () => {
    expect(authCookieOptions()).toEqual({ httpOnly: true, secure: false, sameSite: 'lax', path: '/' });
    vi.stubEnv('NODE_ENV', 'production');
    expect(authCookieOptions().secure).toBe(true);
  });

  it('maps Supabase auth errors to translated app codes', () => {
    expect(authErrorCode({ code: 'otp_expired', status: 403 })).toEqual({ status: 400, error: 'invalid_code' });
    expect(authErrorCode({ code: 'mfa_verification_failed', status: 422 })).toEqual({ status: 400, error: 'invalid_totp' });
    expect(authErrorCode({ code: 'mfa_challenge_expired', status: 422 })).toEqual({ status: 400, error: 'challenge_expired' });
    expect(authErrorCode({ code: 'session_not_found', status: 403 })).toEqual({ status: 401, error: 'unauthorized' });
    expect(authErrorCode({ code: 'something_new', status: 429 })).toEqual({ status: 429, error: 'rate_limited' });
    expect(authErrorCode({ code: undefined, status: undefined })).toEqual({ status: 502, error: 'unavailable' });
  });

  it('accepts only SVG QR codes', () => {
    expect(qrDataUrl(`data:image/svg+xml;utf-8,${SVG}`)).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(qrDataUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(qrDataUrl(undefined)).toBeNull();
  });
});
