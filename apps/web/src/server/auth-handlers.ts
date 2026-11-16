// Sign-in routes of the backend-for-frontend (US-01, ENG-22): Supabase Auth, run on this server so the session
// lands in httpOnly cookies and its tokens never reach page JavaScript.
//
//   POST /api/auth/sign-up     { email, password, locale }  new citizen account (signUp): signed in at aal1
//   POST /api/auth/sign-in     { email, password }          signInWithPassword: signed in at aal1
//   POST /api/auth/mfa                            staff: the TOTP step. Enrols a factor the first time and
//                                                 answers with its QR code and secret; otherwise just `totp`
//   POST /api/auth/mfa/verify  { code }           challenge + verify the TOTP code: the session becomes aal2
//   POST /api/auth/logout                         signOut on this device
//   GET  /api/session                             { signedIn, email, locale, aal }
//   GET  /api/staff/session                       the staff member and their grants, or why not
import type { Factor } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { callApi, isCrossSite, json, readJsonBody } from './bff';
import { accessToken, authErrorCode, signOutHere, supabaseEnv, supabaseForRequest, type RequestSupabase } from './supabase';

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
const CODE_PATTERN = /^\d{6}$/;
/** Supabase's own limits: at least 10 characters (minimum_password_length in supabase/config.toml), bcrypt reads 72 bytes. */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72;
const LOCALES = new Set(['de', 'en']);

type Body = Record<string, unknown>;

async function readObject(request: NextRequest): Promise<{ ok: true; value: Body } | { ok: false; status: number; error: string }> {
  const body = await readJsonBody(request);
  if (!body.ok) return body;
  const value: unknown = body.text ? JSON.parse(body.text) : {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, status: 400, error: 'invalid_request' };
  return { ok: true, value: value as Body };
}

type Prepared = { ok: true; supabase: RequestSupabase; body: Body } | { ok: false; response: NextResponse };

/** Cross-site check, JSON body, and a Supabase client for this request; 503 when Supabase is not configured. */
async function prepare(request: NextRequest): Promise<Prepared> {
  if (isCrossSite(request)) return { ok: false, response: json({ error: 'forbidden' }, 403) };
  const body = await readObject(request);
  if (!body.ok) return { ok: false, response: json({ error: body.error }, body.status) };
  const env = supabaseEnv();
  if (!env) return { ok: false, response: json({ error: 'unavailable' }, 503) };
  return { ok: true, supabase: supabaseForRequest(request, env), body: body.value };
}

function fail(supabase: RequestSupabase, error: { code?: string; status?: number } | null | undefined): NextResponse {
  const mapped = authErrorCode(error);
  return supabase.apply(json({ error: mapped.error }, mapped.status));
}

function normalEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

function password(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.length >= PASSWORD_MIN && Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX ? value : null;
}

/**
 * Creates a citizen account with email and password (US-01) and signs it in. Supabase sends no confirmation email
 * (`enable_confirmations = false`), so the address is not proven; staff accounts are therefore never made here but
 * by the API when an admin invites someone (ENG-24).
 */
export async function postAuthSignUp(request: NextRequest) {
  const prepared = await prepare(request);
  if (!prepared.ok) return prepared.response;
  const { supabase, body } = prepared;
  const email = normalEmail(body.email);
  if (!email) return json({ error: 'invalid_request' }, 400);
  const secret = password(body.password);
  if (!secret) return json({ error: 'weak_password' }, 400);
  const locale = typeof body.locale === 'string' && LOCALES.has(body.locale) ? body.locale : 'de';
  const { data, error } = await supabase.client.auth.signUp({ email, password: secret, options: { data: { locale } } });
  if (error) return fail(supabase, error);
  // With confirmations off a new user comes back with a session. Without one the project asks for a confirmation
  // email, which this setup does not use: report it rather than pretend the sign-up worked.
  if (!data.session) return supabase.apply(json({ error: 'unavailable' }, 502));
  return supabase.apply(json({ signedIn: true, aal: 'aal1' }, 201));
}

/** Signs in with email and password. The session goes into the cookies; the body says only that it worked. */
export async function postAuthSignIn(request: NextRequest) {
  const prepared = await prepare(request);
  if (!prepared.ok) return prepared.response;
  const { supabase, body } = prepared;
  const email = normalEmail(body.email);
  // One answer for every wrong input, so the form does not reveal which addresses have accounts.
  if (!email || typeof body.password !== 'string' || !body.password) return json({ error: 'invalid_credentials' }, 400);
  const { data, error } = await supabase.client.auth.signInWithPassword({ email, password: body.password });
  if (error || !data.session) return fail(supabase, error);
  return supabase.apply(json({ signedIn: true, aal: 'aal1' }));
}

/** Signs out of Supabase on this device and clears the cookies. */
export async function postAuthLogout(request: NextRequest) {
  if (isCrossSite(request)) return json({ error: 'forbidden' }, 403);
  const env = supabaseEnv();
  if (!env) return json({ signedIn: false });
  const supabase = supabaseForRequest(request, env);
  await signOutHere(supabase.client);
  return supabase.apply(json({ signedIn: false }));
}

const isTotp = (factor: Factor) => factor.factor_type === 'totp';

/** Supabase hands the QR code as `data:image/svg+xml;utf-8,<svg…>`; as base64 it survives `#` and quotes in an img src. */
export function qrDataUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^data:image\/svg\+xml;(?:utf-8|charset=utf-8),([\s\S]*)$/i.exec(value);
  const svg = match ? match[1]! : value.trim().startsWith('<svg') ? value.trim() : null;
  if (!svg || !svg.trim().startsWith('<svg')) return null;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

/**
 * The console's second step. With a verified TOTP factor: `{ next: 'totp' }`. Without one: drops any factor
 * left unverified by an earlier attempt, enrols a new one and answers with its QR code and secret.
 */
export async function postMfaStart(request: NextRequest) {
  const prepared = await prepare(request);
  if (!prepared.ok) return prepared.response;
  const { supabase } = prepared;
  if (!(await accessToken(supabase.client))) return supabase.apply(json({ error: 'unauthorized' }, 401));
  const factors = await supabase.client.auth.mfa.listFactors();
  if (factors.error) return fail(supabase, factors.error);
  if (factors.data.totp.length > 0) return supabase.apply(json({ next: 'totp' }));

  for (const stale of factors.data.all.filter((f) => isTotp(f) && f.status !== 'verified')) {
    await supabase.client.auth.mfa.unenroll({ factorId: stale.id });
  }
  const enrolled = await supabase.client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Kiezruf ${new Date().toISOString().slice(0, 10)}` });
  if (enrolled.error) return fail(supabase, enrolled.error);
  const totp = enrolled.data.type === 'totp' ? enrolled.data.totp : null;
  return supabase.apply(json({ next: 'enroll', qrCode: qrDataUrl(totp?.qr_code), secret: typeof totp?.secret === 'string' ? totp.secret : null }));
}

/** Verifies a TOTP code against the verified factor, or the one being enrolled. The session becomes aal2. */
export async function postMfaVerify(request: NextRequest) {
  const prepared = await prepare(request);
  if (!prepared.ok) return prepared.response;
  const { supabase, body } = prepared;
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!CODE_PATTERN.test(code)) return json({ error: 'invalid_totp' }, 400);
  if (!(await accessToken(supabase.client))) return supabase.apply(json({ error: 'unauthorized' }, 401));
  const factors = await supabase.client.auth.mfa.listFactors();
  if (factors.error) return fail(supabase, factors.error);
  const factor =
    factors.data.totp[0] ??
    factors.data.all
      .filter((f) => isTotp(f) && f.status !== 'verified')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!factor) return supabase.apply(json({ error: 'challenge_expired' }, 400));
  const challenge = await supabase.client.auth.mfa.challenge({ factorId: factor.id });
  if (challenge.error) return fail(supabase, challenge.error);
  const verified = await supabase.client.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.data.id, code });
  if (verified.error) return fail(supabase, verified.error);
  return supabase.apply(json({ signedIn: true, aal: 'aal2' }));
}

/** The session's assurance level, read from its access token (no network call). */
async function currentAal(supabase: RequestSupabase): Promise<string | null> {
  try {
    const { data } = await supabase.client.auth.mfa.getAuthenticatorAssuranceLevel();
    return data?.currentLevel ?? null;
  } catch {
    return null;
  }
}

/** Who is signed in, for the browser: email, language and assurance level. Signs out a session the API refuses. */
export async function getSession(request: NextRequest) {
  const env = supabaseEnv();
  if (!env) return json({ signedIn: false });
  const supabase = supabaseForRequest(request, env);
  const token = await accessToken(supabase.client);
  if (!token) return supabase.apply(json({ signedIn: false }));
  // GET /me also creates the account on first use (README "API (citizen core)").
  const answer = await callApi('me', { method: 'GET', token, request });
  if (answer.status === 401) {
    await signOutHere(supabase.client);
    return supabase.apply(json({ signedIn: false }));
  }
  if (answer.status !== 200 || !answer.body || typeof answer.body !== 'object') return supabase.apply(json({ error: 'unavailable' }, 502));
  const me = answer.body as { email?: unknown; locale?: unknown };
  return supabase.apply(
    json({
      signedIn: true,
      email: typeof me.email === 'string' ? me.email : undefined,
      locale: typeof me.locale === 'string' ? me.locale : undefined,
      aal: (await currentAal(supabase)) ?? 'aal1',
    }),
  );
}

/**
 * The signed-in staff member and their grants (GET /staff/me). Without a staff session it says why, so the
 * console sign-in can pick the step: no session (`signedIn: false`), the TOTP step (`reason: 'mfa_required'`),
 * or an account without a staff role (`reason: 'not_staff'`, the Supabase session stays for the citizen pages).
 */
export async function getStaffSession(request: NextRequest) {
  const env = supabaseEnv();
  if (!env) return json({ signedIn: false });
  const supabase = supabaseForRequest(request, env);
  const token = await accessToken(supabase.client);
  if (!token) return supabase.apply(json({ signedIn: false }));
  if ((await currentAal(supabase)) !== 'aal2') return supabase.apply(json({ signedIn: false, reason: 'mfa_required' }));
  const answer = await callApi('staff/me', { method: 'GET', token, request });
  const error = (answer.body as { error?: unknown } | null)?.error;
  if (answer.status === 401 && error === 'mfa_required') return supabase.apply(json({ signedIn: false, reason: 'mfa_required' }));
  if (answer.status === 401) {
    await signOutHere(supabase.client);
    return supabase.apply(json({ signedIn: false }));
  }
  if (answer.status === 403) return supabase.apply(json({ signedIn: false, reason: 'not_staff' }));
  if (answer.status !== 200 || !answer.body || typeof answer.body !== 'object') return supabase.apply(json({ error: 'unavailable' }, 502));
  const me = answer.body as { id?: unknown; email?: unknown; grants?: unknown; preferences?: unknown };
  // Staff preferences, e.g. the Monday briefing email (US-56). Only known keys pass.
  const prefs = me.preferences && typeof me.preferences === 'object' ? (me.preferences as { briefingEmail?: unknown }) : null;
  return supabase.apply(
    json({
      signedIn: true,
      me: {
        id: typeof me.id === 'string' ? me.id : '',
        email: typeof me.email === 'string' ? me.email : '',
        grants: Array.isArray(me.grants) ? me.grants : [],
        ...(prefs && typeof prefs.briefingEmail === 'boolean' ? { preferences: { briefingEmail: prefs.briefingEmail } } : {}),
      },
    }),
  );
}
