// Sign-in, sign-out and session routes of the backend-for-frontend (US-01). The token from POST /auth/verify goes
// into the httpOnly cookie and never into a response body.
import type { NextRequest } from 'next/server';
import { callApi, clearSessionCookie, isCrossSite, json, readJsonBody, relay, sessionToken, setSessionCookie } from './bff';

export async function postAuthCode(request: NextRequest) {
  if (isCrossSite(request)) return json({ error: 'forbidden' }, 403);
  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: body.error }, body.status);
  return relay(await callApi('auth/code', { method: 'POST', body: body.text ?? '{}', request }));
}

export async function postAuthVerify(request: NextRequest) {
  if (isCrossSite(request)) return json({ error: 'forbidden' }, 403);
  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: body.error }, body.status);
  const answer = await callApi('auth/verify', { method: 'POST', body: body.text ?? '{}', request });
  const result = answer.body as { token?: unknown; expiresAt?: unknown; newAccount?: unknown } | null;
  if (answer.status !== 200 || !result || typeof result.token !== 'string') return relay(answer);
  const response = json({ signedIn: true, newAccount: result.newAccount === true });
  setSessionCookie(response, result.token, typeof result.expiresAt === 'string' ? result.expiresAt : undefined);
  return response;
}

export async function postAuthLogout(request: NextRequest) {
  if (isCrossSite(request)) return json({ error: 'forbidden' }, 403);
  const token = sessionToken(request);
  // Ends the session in the API too; the cookie goes either way.
  if (token) await callApi('auth/logout', { method: 'POST', token, request });
  const response = json({ signedIn: false });
  clearSessionCookie(response);
  return response;
}

/** Who is signed in, for the browser: email and language only. Clears a cookie the API no longer accepts. */
export async function getSession(request: NextRequest) {
  const token = sessionToken(request);
  if (!token) return json({ signedIn: false });
  const answer = await callApi('me', { method: 'GET', token, request });
  if (answer.status === 401) {
    const response = json({ signedIn: false });
    clearSessionCookie(response);
    return response;
  }
  if (answer.status !== 200 || !answer.body || typeof answer.body !== 'object') return json({ error: 'unavailable' }, 502);
  const me = answer.body as { email?: unknown; locale?: unknown };
  return json({
    signedIn: true,
    email: typeof me.email === 'string' ? me.email : undefined,
    locale: typeof me.locale === 'string' ? me.locale : undefined,
  });
}
