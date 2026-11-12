// Staff sign-in for the console (README "API (admin console, Phase 2)", ENG-09): email code, then a TOTP second
// factor. The email code itself goes through the citizen route POST /api/auth/code (no token involved).
//
// 1. POST /api/staff/auth/verify { email, code }: the API answers with a challenge. The challenge stays in an
//    httpOnly cookie scoped to /api/staff/auth; the browser only learns the next step (and, the first time,
//    the otpauth URI and secret it needs to show the QR code).
// 2. POST /api/staff/auth/totp { totp }: the challenge from the cookie plus the code from the authenticator. The
//    staff token goes into its own httpOnly cookie and never into a response body.
import type { NextRequest } from 'next/server';
import {
  callApi,
  clearStaffChallenge,
  clearStaffCookie,
  isCrossSite,
  json,
  readJsonBody,
  relay,
  setStaffChallenge,
  setStaffCookie,
  staffChallenge,
  staffToken,
} from './bff';

async function readObject(request: NextRequest): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const body = await readJsonBody(request);
  if (!body.ok) return body;
  const value: unknown = body.text ? JSON.parse(body.text) : {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, status: 400, error: 'invalid_request' };
  return { ok: true, value: value as Record<string, unknown> };
}

export async function postStaffVerify(request: NextRequest) {
  if (isCrossSite(request)) return json({ error: 'forbidden' }, 403);
  const body = await readObject(request);
  if (!body.ok) return json({ error: body.error }, body.status);
  const { email, code } = body.value;
  if (typeof email !== 'string' || typeof code !== 'string') return json({ error: 'invalid_request' }, 400);
  const answer = await callApi('staff/auth/verify', { method: 'POST', body: JSON.stringify({ email, code }), request });
  const result = answer.body as { challenge?: unknown; next?: unknown; otpauthUri?: unknown; secret?: unknown } | null;
  if (answer.status !== 200 || !result || typeof result.challenge !== 'string' || (result.next !== 'totp' && result.next !== 'enroll')) {
    return relay(answer);
  }
  const response =
    result.next === 'enroll'
      ? json({
          next: 'enroll',
          otpauthUri: typeof result.otpauthUri === 'string' ? result.otpauthUri : null,
          secret: typeof result.secret === 'string' ? result.secret : null,
        })
      : json({ next: 'totp' });
  setStaffChallenge(response, result.challenge);
  return response;
}

export async function postStaffTotp(request: NextRequest) {
  if (isCrossSite(request)) return json({ error: 'forbidden' }, 403);
  const body = await readObject(request);
  if (!body.ok) return json({ error: body.error }, body.status);
  const { totp } = body.value;
  if (typeof totp !== 'string' || !/^\d{6}$/.test(totp)) return json({ error: 'invalid_totp' }, 400);
  const challenge = staffChallenge(request);
  if (!challenge) return json({ error: 'challenge_expired' }, 400);

  const answer = await callApi('staff/auth/totp', { method: 'POST', body: JSON.stringify({ challenge, totp }), request });
  const result = answer.body as { token?: unknown; expiresAt?: unknown } | null;
  if (answer.status !== 200 || !result || typeof result.token !== 'string') {
    const response = relay(answer);
    // A wrong code may be retried with the same challenge; an expired one needs the email step again.
    const code = (answer.body as { error?: unknown } | null)?.error;
    if (code === 'challenge_expired' || answer.status === 401) clearStaffChallenge(response);
    return response;
  }
  const response = json({ signedIn: true });
  setStaffCookie(response, result.token, typeof result.expiresAt === 'string' ? result.expiresAt : undefined);
  clearStaffChallenge(response);
  return response;
}

export async function postStaffLogout(request: NextRequest) {
  if (isCrossSite(request)) return json({ error: 'forbidden' }, 403);
  const token = staffToken(request);
  // Ends the session in the API too; the cookie goes either way.
  if (token) await callApi('staff/auth/logout', { method: 'POST', token, request });
  const response = json({ signedIn: false });
  clearStaffCookie(response);
  return response;
}

/** The signed-in staff member and their grants (GET /staff/me). Clears a cookie the API no longer accepts. */
export async function getStaffSession(request: NextRequest) {
  const token = staffToken(request);
  if (!token) return json({ signedIn: false });
  const answer = await callApi('staff/me', { method: 'GET', token, request });
  if (answer.status === 401 || answer.status === 403) {
    const response = json({ signedIn: false });
    clearStaffCookie(response);
    return response;
  }
  if (answer.status !== 200 || !answer.body || typeof answer.body !== 'object') return json({ error: 'unavailable' }, 502);
  const me = answer.body as { id?: unknown; email?: unknown; grants?: unknown; preferences?: unknown };
  // Staff preferences, e.g. the Monday briefing email (US-56). Only known keys pass.
  const prefs = me.preferences && typeof me.preferences === 'object' ? (me.preferences as { briefingEmail?: unknown }) : null;
  return json({
    signedIn: true,
    me: {
      id: typeof me.id === 'string' ? me.id : '',
      email: typeof me.email === 'string' ? me.email : '',
      grants: Array.isArray(me.grants) ? me.grants : [],
      ...(prefs && typeof prefs.briefingEmail === 'boolean' ? { preferences: { briefingEmail: prefs.briefingEmail } } : {}),
    },
  });
}
