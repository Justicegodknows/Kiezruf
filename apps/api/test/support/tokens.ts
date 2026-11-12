// Supabase-style access tokens for tests, signed with HS256 and a test secret (the API accepts HS256 when
// SUPABASE_JWT_SECRET is set, as for HS256 Supabase projects).
import { createHash, createHmac } from 'node:crypto';

export const TEST_SUPABASE_URL = 'https://kiezruf-test.supabase.co';
export const TEST_JWT_SECRET = 'test-jwt-secret-with-at-least-32-characters';

/** A stable Supabase user id per email address, in UUID form. */
export function authUserIdFor(email: string): string {
  const h = createHash('sha256').update(email.toLowerCase()).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export interface TokenOptions {
  email: string;
  /** aal2 with a TOTP check `mfaAgeSeconds` ago: a staff session. */
  mfa?: boolean;
  mfaAgeSeconds?: number;
  expiresInSeconds?: number;
  secret?: string;
  overrides?: Record<string, unknown>;
}

export function accessToken(o: TokenOptions): string {
  const now = Math.floor(Date.now() / 1000);
  const amr = [{ method: 'otp', timestamp: now - 60 }];
  if (o.mfa) amr.push({ method: 'totp', timestamp: now - (o.mfaAgeSeconds ?? 30) });
  const payload = {
    iss: `${TEST_SUPABASE_URL}/auth/v1`,
    aud: 'authenticated',
    role: 'authenticated',
    sub: authUserIdFor(o.email),
    email: o.email,
    aal: o.mfa ? 'aal2' : 'aal1',
    amr,
    iat: now,
    exp: now + (o.expiresInSeconds ?? 3600),
    ...o.overrides,
  };
  const enc = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const unsigned = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(payload)}`;
  const sig = createHmac('sha256', o.secret ?? TEST_JWT_SECRET).update(unsigned).digest('base64url');
  return `${unsigned}.${sig}`;
}
