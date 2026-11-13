// @vitest-environment node
// src/proxy.ts: session refresh on page requests, and console pages only with a staff-grade session (aal2, TOTP
// within 12 hours). Supabase is a fake (src/test/fake-supabase.ts).
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { safeConsoleNext } from '@/lib/console-paths';
import { staffMfaFresh, STAFF_MFA_MAX_AGE_SECONDS } from '@/server/supabase';
import { AUTH_COOKIE, fake, stubSupabaseEnv } from '@/test/fake-supabase';
import { config, proxy } from './proxy';

vi.mock('@supabase/ssr', async () => (await import('@/test/fake-supabase')).ssrModule);

const ID = 'BE-NK-2026-0112';
const now = () => Math.floor(Date.now() / 1000);

function request(path: string, session?: string) {
  const headers: Record<string, string> = { host: 'localhost:3000' };
  if (session) headers.cookie = `${AUTH_COOKIE}=${session}`;
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

const location = (response: Response) => {
  const value = response.headers.get('location');
  return value ? new URL(value) : null;
};

beforeEach(() => {
  fake.reset();
  fake.tokens.tok_aal1 = { aal: 'aal1' };
  fake.tokens.tok_aal2 = { aal: 'aal2', totpAt: now() - 3_600 };
  fake.tokens.tok_aal2_stale = { aal: 'aal2', totpAt: now() - 13 * 3_600 };
  stubSupabaseEnv(vi.stubEnv);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('console pages need an aal2 session (src/proxy.ts)', () => {
  it('sends a request without a session to sign-in, keeping where it was going', async () => {
    const response = await proxy(request(`/console/reports/${ID}?x=1`));
    expect(response.status).toBe(307);
    expect(location(response)!.pathname).toBe('/console/sign-in');
    expect(location(response)!.searchParams.get('next')).toBe(`/console/reports/${ID}?x=1`);
  });

  it('sends a session at aal1 (password only, e.g. a citizen) to sign-in', async () => {
    const response = await proxy(request('/console/queue', 'tok_aal1'));
    expect(location(response)!.pathname).toBe('/console/sign-in');
    expect(location(response)!.searchParams.get('next')).toBe('/console/queue');
  });

  it('sends an aal2 session whose TOTP check is older than 12 hours to sign-in', async () => {
    const response = await proxy(request('/console', 'tok_aal2_stale'));
    expect(location(response)!.pathname).toBe('/console/sign-in');
  });

  it('lets a fresh aal2 session through, and anyone to the sign-in page', async () => {
    expect(location(await proxy(request('/console/queue', 'tok_aal2')))).toBeNull();
    expect(location(await proxy(request('/console/sign-in')))).toBeNull();
    expect(location(await proxy(request('/console/sign-in', 'tok_aal1')))).toBeNull();
  });

  it('sends console pages to sign-in when Supabase is not configured, and leaves other pages alone', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(location(await proxy(request('/console', 'tok_aal2')))!.pathname).toBe('/console/sign-in');
    expect(location(await proxy(request('/my-reports', 'tok_aal1')))).toBeNull();
  });
});

describe('session refresh on page requests', () => {
  it('refreshes an expired session on a citizen page and sends the new httpOnly cookie', async () => {
    fake.tokens.tok_refreshed = { aal: 'aal1' };
    fake.refresh.tok_expired = 'tok_refreshed';
    const response = await proxy(request('/my-reports', 'tok_expired'));
    expect(location(response)).toBeNull();
    const cookie = response.headers.getSetCookie().find((c) => c.startsWith(`${AUTH_COOKIE}=`)) ?? '';
    expect(cookie).toContain(`${AUTH_COOKIE}=tok_refreshed`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(response.headers.get('cache-control')).toMatch(/no-store/);
    // The page rendered in this request sees the refreshed cookie too.
    expect(response.headers.get('x-middleware-request-cookie') ?? response.headers.get('x-middleware-override-headers')).toBeTruthy();
  });

  it('runs on pages but not on /api routes or static files', () => {
    const [pattern] = config.matcher;
    const matches = (path: string) => new RegExp(`^${pattern}$`).test(path);
    expect(matches('/console/queue')).toBe(true);
    expect(matches('/my-reports')).toBe(true);
    expect(matches('/')).toBe(true);
    expect(matches('/api/session')).toBe(false);
    expect(matches('/_next/static/chunk.js')).toBe(false);
    expect(matches('/favicon.ico')).toBe(false);
  });
});

describe('staff-grade sessions and sign-in redirects', () => {
  it('counts a TOTP check as fresh for 12 hours, from amr', () => {
    const t = now();
    expect(staffMfaFresh({ aal: 'aal2', amr: [{ method: 'totp', timestamp: t - 60 }] }, t)).toBe(true);
    expect(staffMfaFresh({ aal: 'aal2', amr: [{ method: 'totp', timestamp: t - STAFF_MFA_MAX_AGE_SECONDS }] }, t)).toBe(true);
    expect(staffMfaFresh({ aal: 'aal2', amr: [{ method: 'totp', timestamp: t - STAFF_MFA_MAX_AGE_SECONDS - 1 }] }, t)).toBe(false);
    expect(staffMfaFresh({ aal: 'aal1', amr: [{ method: 'otp', timestamp: t }] }, t)).toBe(false);
    expect(staffMfaFresh({ aal: 'aal2', amr: [{ method: 'otp', timestamp: t }] }, t)).toBe(false);
    expect(staffMfaFresh({ aal: 'aal2', amr: ['otp', 'totp'], iat: t - 100 }, t)).toBe(true);
    expect(staffMfaFresh(null, t)).toBe(false);
  });

  it('only ever sends staff back to a console page after sign-in', () => {
    expect(safeConsoleNext('/console/tenants')).toBe('/console/tenants');
    expect(safeConsoleNext('/console?level=Critical')).toBe('/console?level=Critical');
    for (const bad of ['https://evil.example', '//evil.example/console', '/consolex', '/console//evil', '/console\\evil', '/console/sign-in', null, '']) {
      expect(safeConsoleNext(bad)).toBe('/console');
    }
  });
});
