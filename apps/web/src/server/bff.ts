// Server code only: imported by the route handlers in src/app/api. (The `server-only` package is not installed.)
// Backend-for-frontend (engineering plan, Sessions): the browser talks only to this site's /api routes.
// They keep the API session token in an httpOnly cookie and add it as `Authorization: Bearer` when they call
// the Kiezruf API. Nothing here logs request bodies, email addresses or tokens.
import { REPORT_ID_PATTERN } from '@kiezruf/shared';
import { NextResponse, type NextRequest } from 'next/server';

export const SESSION_COOKIE = 'kiezruf_session';
/** The staff session (console). Its own cookie: staff routes never see the citizen token and vice versa. */
export const STAFF_COOKIE = 'kiezruf_staff_session';
/** The sign-in challenge between the email code and the TOTP step. Only the staff sign-in routes read it. */
export const STAFF_CHALLENGE_COOKIE = 'kiezruf_staff_challenge';
export const STAFF_CHALLENGE_PATH = '/api/staff/auth';
/** Staff sessions last 12 hours (README, "API (admin console, Phase 2)"); used when the API sends no expiry. */
export const STAFF_SESSION_HOURS = 12;
const STAFF_CHALLENGE_SECONDS = 10 * 60;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,200}$/;
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
  return value && TOKEN_PATTERN.test(value) ? value : null;
}

// --- Staff session (console) -------------------------------------------------------------------------------

/**
 * httpOnly, Secure, SameSite=Strict, whole site (the console pages under /console check it in src/proxy.ts).
 * Strict: a link from another site (an invitation email) opens the console without the session, and the
 * sign-in page then finds the session with a same-site request.
 */
export function staffCookieOptions(expires: Date) {
  return { httpOnly: true, secure: true, sameSite: 'strict' as const, path: '/', expires };
}

/** Expires with the token: the API's `expiresAt`, or 12 hours from now when it is missing or unreadable. */
export function setStaffCookie(response: NextResponse, token: string, expiresAt: string | undefined, now = new Date()) {
  const fromApi = expiresAt ? new Date(expiresAt) : null;
  const fallback = new Date(now.getTime() + STAFF_SESSION_HOURS * 3_600_000);
  const expires = fromApi && !Number.isNaN(fromApi.getTime()) && fromApi > now ? fromApi : fallback;
  response.cookies.set(STAFF_COOKIE, token, staffCookieOptions(expires));
}

export function clearStaffCookie(response: NextResponse) {
  response.cookies.set(STAFF_COOKIE, '', { ...staffCookieOptions(new Date(0)), maxAge: 0 });
}

export function staffToken(request: NextRequest): string | null {
  const value = request.cookies.get(STAFF_COOKIE)?.value;
  return value && TOKEN_PATTERN.test(value) ? value : null;
}

export function setStaffChallenge(response: NextResponse, challenge: string) {
  response.cookies.set(STAFF_CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: STAFF_CHALLENGE_PATH,
    maxAge: STAFF_CHALLENGE_SECONDS,
  });
}

export function clearStaffChallenge(response: NextResponse) {
  response.cookies.set(STAFF_CHALLENGE_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'strict', path: STAFF_CHALLENGE_PATH, maxAge: 0, expires: new Date(0) });
}

export function staffChallenge(request: NextRequest): string | null {
  const value = request.cookies.get(STAFF_CHALLENGE_COOKIE)?.value;
  return value && /^[A-Za-z0-9_.~+/=-]{8,512}$/.test(value) ? value : null;
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
/** Forward-link tokens (US-45): opaque, URL-safe. */
const LINK_TOKEN = '[A-Za-z0-9_-]{16,200}';

/**
 * Which token a route gets. `public`: none, so browsing stays anonymous even when signed in. `citizen`: the
 * citizen cookie only. `staff`: the staff cookie only, so a citizen session can never reach a staff route and
 * a staff session never acts as a citizen.
 */
export type Auth = 'public' | 'citizen' | 'staff';

interface Rule {
  methods: Method[];
  pattern: RegExp;
  auth: Auth;
  /** Query parameters passed on for GET; anything else is dropped. */
  query: ReadonlySet<string>;
  /** Pass the API's answer through byte for byte (CSV downloads, US-55) instead of reading it as JSON. */
  raw?: boolean;
}

/** Query parameters the public endpoints take. */
const PUBLIC_QUERY = new Set(['lat', 'lon', 'radiusM', 'category', 'status', 'maxAgeDays', 'limit']);
/** GET /staff/reports (US-25). */
const QUEUE_QUERY = new Set(['status', 'level', 'category', 'tenantId', 'maxAgeDays', 'sort', 'limit', 'offset']);
const NO_QUERY = new Set<string>();
/** Analysis views for one tenant in scope (US-50, US-53): GET /staff/hotspots, /staff/briefings, trends.csv. */
const TENANT_QUERY = new Set(['tenantId']);
/** GET /staff/trends (US-51). */
const TRENDS_QUERY = new Set(['tenantId', 'weeks']);
/** GET /staff/export/queue.csv (US-55): tenant and date range. */
const EXPORT_QUERY = new Set(['tenantId', 'from', 'to']);

const rule = (
  methods: Method[],
  path: string,
  auth: Auth,
  query: ReadonlySet<string> = auth === 'staff' ? NO_QUERY : PUBLIC_QUERY,
  raw = false,
): Rule => ({
  methods,
  pattern: new RegExp(`^${path}$`),
  auth,
  query,
  ...(raw ? { raw } : {}),
});

/**
 * Every API endpoint the browser may reach through the catch-all proxy. Sign-in (citizen and staff) has its own
 * routes, so `auth/*` and `staff/auth/*` are not here.
 */
export const PROXY_RULES: readonly Rule[] = [
  rule(['GET'], 'public/route', 'public'),
  rule(['POST'], 'public/report-attempts', 'public'),
  rule(['GET'], 'public/reports', 'public'),
  rule(['GET'], `public/reports/${ID}`, 'public'),
  rule(['GET'], `public/reports/${ID}/comments`, 'public'),
  rule(['POST'], 'uploads', 'citizen'),
  rule(['POST'], 'reports', 'citizen'),
  // Phase 3 (README "API (analysis and AI, Phase 3)"): category suggestion, "Already reported?", co-reporting.
  rule(['POST'], 'uploads/suggest', 'citizen'),
  rule(['POST'], 'reports/duplicates', 'citizen'),
  rule(['POST'], `reports/${ID}/co-report`, 'citizen'),
  rule(['GET'], 'me/reports', 'citizen'),
  rule(['GET'], 'me/follows', 'citizen'),
  rule(['GET'], `reports/${ID}/me`, 'citizen'),
  rule(['PUT', 'DELETE'], `reports/${ID}/me-too`, 'citizen'),
  rule(['PUT', 'DELETE'], `reports/${ID}/follow`, 'citizen'),
  rule(['POST'], `reports/${ID}/comments`, 'citizen'),
  rule(['POST'], `comments/${UUID}/flag`, 'citizen'),
  rule(['GET', 'PUT'], 'me/notification-settings', 'citizen'),
  rule(['POST'], 'go-live-alerts', 'citizen'),
  rule(['PATCH', 'DELETE'], 'me', 'citizen'),
  // Console (README "API (admin console, Phase 2)"). The API scopes every one to the caller's subtree (US-42).
  rule(['GET'], 'staff/me', 'staff'),
  rule(['GET'], 'staff/reports', 'staff', QUEUE_QUERY),
  rule(['GET'], `staff/reports/${ID}`, 'staff'),
  rule(['PATCH'], `staff/reports/${ID}/status`, 'staff'),
  rule(['PUT'], `staff/reports/${ID}/override`, 'staff'),
  rule(['POST'], `staff/reports/${ID}/forward`, 'staff'),
  rule(['POST'], `staff/reports/${ID}/merge`, 'staff'),
  rule(['POST'], `staff/reports/${ID}/spike`, 'staff'),
  rule(['GET'], 'staff/moderation', 'staff'),
  rule(['PATCH'], `staff/comments/${UUID}`, 'staff'),
  rule(['POST'], `staff/accounts/${UUID}/ban`, 'staff'),
  rule(['GET'], 'staff/tenants', 'staff'),
  rule(['PATCH'], `staff/tenants/${UUID}`, 'staff'),
  rule(['PUT'], `staff/tenants/${UUID}/settings`, 'staff'),
  rule(['GET', 'POST'], `staff/tenants/${UUID}/contacts`, 'staff'),
  rule(['DELETE'], `staff/tenants/${UUID}/contacts/${UUID}`, 'staff'),
  rule(['GET', 'POST'], `staff/tenants/${UUID}/staff`, 'staff'),
  rule(['DELETE'], `staff/tenants/${UUID}/staff/${UUID}`, 'staff'),
  // Analysis and AI (Phase 3): merge suggestions, hotspots, trends, briefings, preferences, CSV export.
  rule(['GET'], `staff/reports/${ID}/duplicates`, 'staff'),
  rule(['GET'], 'staff/hotspots', 'staff', TENANT_QUERY),
  rule(['GET'], 'staff/trends', 'staff', TRENDS_QUERY),
  rule(['GET'], 'staff/briefings', 'staff', TENANT_QUERY),
  rule(['POST'], `staff/briefings/items/${UUID}/rating`, 'staff'),
  rule(['PUT'], 'staff/me/preferences', 'staff'),
  rule(['GET'], 'staff/export/queue.csv', 'staff', EXPORT_QUERY, true),
  rule(['GET'], 'staff/export/trends.csv', 'staff', TENANT_QUERY, true),
  // Forward links (US-45): no login, so no token of either kind.
  rule(['GET'], `forwarded/${LINK_TOKEN}`, 'public', NO_QUERY),
];

/** Headers of a download that pass through unchanged. */
const RAW_HEADERS = ['content-type', 'content-disposition', 'content-length'] as const;

/**
 * Fetches a download (GET only) and hands its body on as it came, with its content type and file name, so a CSV
 * reaches the browser unchanged (US-55). Errors the API answers with JSON pass through the same way.
 */
async function passThrough(path: string, token: string | null, request: NextRequest): Promise<NextResponse> {
  const headers: Record<string, string> = { accept: 'text/csv, application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const acceptLanguage = request.headers.get('accept-language');
  if (acceptLanguage) headers['accept-language'] = acceptLanguage;
  let upstream: Response;
  try {
    upstream = await fetch(`${apiBaseUrl()}/${path}`, {
      method: 'GET',
      headers,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch {
    return json({ error: 'unavailable' }, 502);
  }
  if (upstream.status >= 300 && upstream.status < 400) return json({ error: 'unavailable' }, 502);
  const out = new Headers({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  for (const name of RAW_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers: out });
}

export function matchRule(method: string, path: string): Rule | null {
  return PROXY_RULES.find((r) => (r.methods as string[]).includes(method) && r.pattern.test(path)) ?? null;
}

function forwardQuery(request: NextRequest, keys: ReadonlySet<string>): string {
  const out = new URLSearchParams();
  request.nextUrl.searchParams.forEach((value, key) => {
    if (keys.has(key) && value.length <= 64) out.append(key, value);
  });
  const qs = out.toString();
  return qs ? `?${qs}` : '';
}

function tokenFor(auth: Auth, request: NextRequest): string | null {
  if (auth === 'citizen') return sessionToken(request);
  if (auth === 'staff') return staffToken(request);
  return null;
}

/** The catch-all proxy: allowlisted path, token from the matching cookie, that cookie cleared when the API says 401. */
export async function proxy(request: NextRequest, segments: string[]): Promise<NextResponse> {
  if (isCrossSite(request)) return json({ error: 'forbidden' }, 403);
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return json({ error: 'not_found' }, 404);
  const path = segments.join('/');
  const found = matchRule(request.method, path);
  if (!found) return json({ error: 'not_found' }, 404);

  const token = tokenFor(found.auth, request);
  if (found.auth !== 'public' && !token) return json({ error: 'unauthorized' }, 401);

  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: body.error }, body.status);

  if (found.raw) {
    const response = await passThrough(`${path}${forwardQuery(request, found.query)}`, token, request);
    if (response.status === 401 && found.auth === 'staff') clearStaffCookie(response);
    return response;
  }

  const answer = await callApi(`${path}${request.method === 'GET' ? forwardQuery(request, found.query) : ''}`, {
    method: request.method,
    token,
    body: body.text,
    request,
  });
  const response = relay(answer);
  // The session is gone (expired, signed out elsewhere, account deleted): drop the cookie too.
  if (answer.status === 401) {
    if (found.auth === 'citizen') clearSessionCookie(response);
    if (found.auth === 'staff') clearStaffCookie(response);
  }
  if (path === 'me' && request.method === 'DELETE' && answer.status >= 200 && answer.status < 300) clearSessionCookie(response);
  return response;
}
