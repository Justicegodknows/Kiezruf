// Server code only: imported by the route handlers in src/app/api. (The `server-only` package is not installed.)
// Backend-for-frontend (engineering plan, Sessions): the browser talks only to this site's /api routes.
// They keep the API session token in an httpOnly cookie and add it as `Authorization: Bearer` when they call
// the Kiezruf API. Nothing here logs request bodies, email addresses or tokens.
import { REPORT_ID_PATTERN } from '@kiezruf/shared';
import { NextResponse, type NextRequest } from 'next/server';

export const SESSION_COOKIE = 'kiezruf_session';
const MAX_BODY_BYTES = 64 * 1024;
const API_TIMEOUT_MS = 15_000;

export function apiBaseUrl(): string {
  return (process.env.API_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '');
}

/** httpOnly, Secure, SameSite=Lax, whole site. Browsers accept Secure cookies on http://localhost too. */
export function sessionCookieOptions(expires?: Date) {
  return { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', ...(expires ? { expires } : {}) };
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: string | undefined) {
  const expires = expiresAt ? new Date(expiresAt) : undefined;
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expires && !Number.isNaN(expires.getTime()) ? expires : undefined));
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(new Date(0)), maxAge: 0 });
}

export function sessionToken(request: NextRequest): string | null {
  const value = request.cookies.get(SESSION_COOKIE)?.value;
  return value && /^[A-Za-z0-9_-]{20,200}$/.test(value) ? value : null;
}

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

/**
 * Rejects requests another site started (CSRF defence on top of SameSite=Lax). Browsers send Sec-Fetch-Site
 * and Origin; a request without them (curl, tests) carries no ambient cookie risk from a browser.
 */
export function isCrossSite(request: NextRequest): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return true;
  const origin = request.headers.get('origin');
  if (origin && request.method !== 'GET' && request.method !== 'HEAD') {
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    try {
      if (new URL(origin).host !== host) return true;
    } catch {
      return true;
    }
  }
  return false;
}

export interface ApiAnswer {
  status: number;
  body: unknown;
}

/** Calls the Kiezruf API. Network failures and timeouts become 502 `unavailable`. */
export async function callApi(
  path: string,
  init: { method: string; token?: string | null; body?: string; request?: NextRequest },
): Promise<ApiAnswer> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  // Lets the API rate-limit per citizen rather than per web server, once it trusts this proxy.
  const forwardedFor = init.request?.headers.get('x-forwarded-for');
  if (forwardedFor) headers['x-forwarded-for'] = forwardedFor;
  const acceptLanguage = init.request?.headers.get('accept-language');
  if (acceptLanguage) headers['accept-language'] = acceptLanguage;
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/${path}`, {
      method: init.method,
      headers,
      body: init.body,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch {
    return { status: 502, body: { error: 'unavailable' } };
  }
  const text = await response.text().catch(() => '');
  if (!text) return { status: response.status, body: null };
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status >= 400 ? response.status : 502, body: { error: 'unavailable' } };
  }
}

/** Reads a JSON request body as text, refusing anything over MAX_BODY_BYTES or not JSON. */
export async function readJsonBody(request: NextRequest): Promise<{ ok: true; text: string | undefined } | { ok: false; status: number; error: string }> {
  if (request.method === 'GET' || request.method === 'HEAD') return { ok: true, text: undefined };
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) return { ok: false, status: 413, error: 'too_large' };
  const text = await request.text();
  if (!text) return { ok: true, text: undefined };
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return { ok: false, status: 413, error: 'too_large' };
  try {
    JSON.parse(text);
  } catch {
    return { ok: false, status: 400, error: 'invalid_request' };
  }
  return { ok: true, text };
}

/** Sends the API's answer on, with no caching. 204 and empty answers have no body. */
export function relay(answer: ApiAnswer): NextResponse {
  if (answer.status === 204 || answer.body === null) {
    return new NextResponse(null, { status: answer.status, headers: { 'cache-control': 'no-store' } });
  }
  return json(answer.body, answer.status);
}

// --- Allowlist ---------------------------------------------------------------------------------------------

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const ID = REPORT_ID_PATTERN.source.replace(/^\^|\$$/g, '');
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

interface Rule {
  methods: Method[];
  pattern: RegExp;
  /** Public endpoints get no token, so browsing stays anonymous even for signed-in citizens. */
  auth: boolean;
}

const rule = (methods: Method[], path: string, auth: boolean): Rule => ({ methods, pattern: new RegExp(`^${path}$`), auth });

/** Every API endpoint the citizen web may reach through the catch-all proxy. Sign-in has its own routes. */
export const PROXY_RULES: readonly Rule[] = [
  rule(['GET'], 'public/route', false),
  rule(['GET'], 'public/reports', false),
  rule(['GET'], `public/reports/${ID}`, false),
  rule(['GET'], `public/reports/${ID}/comments`, false),
  rule(['POST'], 'uploads', true),
  rule(['POST'], 'reports', true),
  rule(['GET'], 'me/reports', true),
  rule(['GET'], 'me/follows', true),
  rule(['GET'], `reports/${ID}/me`, true),
  rule(['PUT', 'DELETE'], `reports/${ID}/me-too`, true),
  rule(['PUT', 'DELETE'], `reports/${ID}/follow`, true),
  rule(['POST'], `reports/${ID}/comments`, true),
  rule(['POST'], `comments/${UUID}/flag`, true),
  rule(['GET', 'PUT'], 'me/notification-settings', true),
  rule(['POST'], 'go-live-alerts', true),
  rule(['PATCH', 'DELETE'], 'me', true),
];

export function matchRule(method: string, path: string): Rule | null {
  return PROXY_RULES.find((r) => (r.methods as string[]).includes(method) && r.pattern.test(path)) ?? null;
}

/** Query parameters the public endpoints take; anything else is dropped. */
const QUERY_KEYS = new Set(['lat', 'lon', 'radiusM', 'category', 'status', 'maxAgeDays', 'limit']);

function forwardQuery(request: NextRequest): string {
  const out = new URLSearchParams();
  request.nextUrl.searchParams.forEach((value, key) => {
    if (QUERY_KEYS.has(key) && value.length <= 64) out.append(key, value);
  });
  const qs = out.toString();
  return qs ? `?${qs}` : '';
}

/** The catch-all proxy: allowlisted path, token from the cookie, cookie cleared when the API says 401. */
export async function proxy(request: NextRequest, segments: string[]): Promise<NextResponse> {
  if (isCrossSite(request)) return json({ error: 'forbidden' }, 403);
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return json({ error: 'not_found' }, 404);
  const path = segments.join('/');
  const found = matchRule(request.method, path);
  if (!found) return json({ error: 'not_found' }, 404);

  const token = found.auth ? sessionToken(request) : null;
  if (found.auth && !token) return json({ error: 'unauthorized' }, 401);

  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: body.error }, body.status);

  const answer = await callApi(`${path}${request.method === 'GET' ? forwardQuery(request) : ''}`, {
    method: request.method,
    token,
    body: body.text,
    request,
  });
  const response = relay(answer);
  // The session is gone (expired, signed out elsewhere, account deleted): drop the cookie too.
  if (found.auth && answer.status === 401) clearSessionCookie(response);
  if (path === 'me' && request.method === 'DELETE' && answer.status >= 200 && answer.status < 300) clearSessionCookie(response);
  return response;
}
