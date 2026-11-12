// Server code only. The one Supabase Auth session (ENG-22) lives in httpOnly cookies written by @supabase/ssr.
// Every Supabase call (email code, MFA, sign-out, refresh) runs on this server, in route handlers and in
// src/proxy.ts, so page JavaScript never sees the access or refresh token. Env is read per request, so the
// build needs no Supabase credentials.
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { AuthError, JwtPayload, SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest, NextResponse } from 'next/server';

export interface SupabaseEnv {
  url: string;
  key: string;
}

/** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the publishable key), or null when unset. */
export function supabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return url && key ? { url, key } : null;
}

/**
 * httpOnly (no browser client reads them), SameSite=Lax, whole site. Secure only in production: Safari refuses
 * Secure cookies on http://localhost, which broke local sign-in with the old cookie.
 */
export function authCookieOptions(): CookieOptions {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' };
}

interface PendingCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

export interface RequestSupabase {
  client: SupabaseClient;
  /** Writes the cookies Supabase changed (refresh, sign-in, sign-out) and its no-cache headers onto a response. */
  apply: <R extends NextResponse>(response: R) => R;
  /** True once Supabase wanted to change a cookie during this request. */
  changed: () => boolean;
}

/**
 * A Supabase client for one request: reads the session from the request cookies and collects whatever it
 * writes, for `apply` to put on the response. The request's own cookie jar is updated too, so code later in the
 * same request (and, from the proxy, the page it renders) sees the refreshed session.
 */
export function supabaseForRequest(request: NextRequest, env: SupabaseEnv): RequestSupabase {
  const pending = new Map<string, PendingCookie>();
  const headers: Record<string, string> = {};
  const client = createServerClient(env.url, env.key, {
    cookieOptions: authCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll(cookies, cacheHeaders) {
        for (const cookie of cookies) {
          pending.set(cookie.name, cookie);
          try {
            if (cookie.value) request.cookies.set(cookie.name, cookie.value);
            else request.cookies.delete(cookie.name);
          } catch {
            // Read-only cookie jars (none in route handlers or the proxy) only miss the in-request update.
          }
        }
        Object.assign(headers, cacheHeaders);
      },
    },
  });
  return {
    client,
    changed: () => pending.size > 0,
    apply(response) {
      for (const { name, value, options } of pending.values()) {
        response.cookies.set(name, value, { ...options, httpOnly: true });
      }
      for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      if (pending.size > 0) response.headers.set('cache-control', 'private, no-store');
      return response;
    },
  };
}

/** The current access token, refreshed when it expired (the refreshed cookies go out through `apply`). */
export async function accessToken(supabase: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Ends the session on this device only: the app and other browsers stay signed in. Never throws. */
export async function signOutHere(supabase: SupabaseClient): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // The local session is removed before the network call, so the cookies are cleared either way.
  }
}

/** Staff routes need a TOTP check at most this old (README "Hosting and sign-in (ENG-22)"). */
export const STAFF_MFA_MAX_AGE_SECONDS = 12 * 60 * 60;

/**
 * Whether a token is good enough for the console: `aal2`, with a TOTP entry in `amr` no older than 12 hours.
 * Tokens with the RFC 8176 string form of `amr` (no timestamps) count from `iat`. The API checks the same.
 */
export function staffMfaFresh(claims: Partial<Pick<JwtPayload, 'aal' | 'amr' | 'iat'>> | null | undefined, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!claims || claims.aal !== 'aal2') return false;
  const amr = Array.isArray(claims.amr) ? claims.amr : [];
  let checkedAt: number | null = null;
  for (const entry of amr) {
    if (typeof entry === 'string') {
      if (entry === 'totp' && typeof claims.iat === 'number') checkedAt = Math.max(checkedAt ?? 0, claims.iat);
    } else if (entry && entry.method === 'totp' && typeof entry.timestamp === 'number') {
      checkedAt = Math.max(checkedAt ?? 0, entry.timestamp);
    }
  }
  return checkedAt !== null && nowSeconds - checkedAt <= STAFF_MFA_MAX_AGE_SECONDS;
}

/**
 * Supabase Auth errors as the app's error codes (src/lib/errors.ts), so the UI can translate them. Supabase says
 * `otp_expired` both for a wrong and for an expired code.
 */
export function authErrorCode(error: { code?: AuthError['code']; status?: number } | null | undefined): { status: number; error: string } {
  const code = error?.code ?? '';
  switch (code) {
    case 'otp_expired':
      return { status: 400, error: 'invalid_code' };
    case 'over_email_send_rate_limit':
    case 'over_sms_send_rate_limit':
      return { status: 429, error: 'too_many_codes' };
    case 'over_request_rate_limit':
      return { status: 429, error: 'rate_limited' };
    case 'mfa_verification_failed':
    case 'mfa_verification_rejected':
      return { status: 400, error: 'invalid_totp' };
    case 'mfa_challenge_expired':
    case 'mfa_factor_not_found':
      return { status: 400, error: 'challenge_expired' };
    case 'email_address_invalid':
    case 'validation_failed':
      return { status: 400, error: 'invalid_request' };
    case 'session_not_found':
    case 'session_expired':
    case 'refresh_token_not_found':
    case 'refresh_token_already_used':
    case 'bad_jwt':
    case 'no_authorization':
    case 'user_not_found':
      return { status: 401, error: 'unauthorized' };
    case 'user_banned':
    case 'signup_disabled':
    case 'otp_disabled':
    case 'email_provider_disabled':
      return { status: 403, error: 'forbidden' };
  }
  if (error?.status === 429) return { status: 429, error: 'rate_limited' };
  return { status: 502, error: 'unavailable' };
}
