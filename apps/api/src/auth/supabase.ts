// Supabase Auth tokens (ENG-22). The API verifies the access token itself (no call to Supabase per request): with the
// project's asymmetric signing keys from its JWKS endpoint (ES256 or RS256), or with SUPABASE_JWT_SECRET for projects
// that still sign with HS256. Supabase admin calls (deleting and banning users) use the service-role key.
import { createHmac, createPublicKey, timingSafeEqual, verify as verifySignature, type JsonWebKey, type KeyObject } from 'node:crypto';

export interface SupabaseClaims {
  /** The Supabase Auth user id. */
  sub: string;
  email: string | null;
  /** aal1 after the email code, aal2 after a second factor. */
  aal: 'aal1' | 'aal2';
  /** How and when the user authenticated in this session, e.g. [{ method: 'otp', timestamp }, { method: 'totp', timestamp }]. */
  amr: { method: string; timestamp: number }[];
  exp: number;
}

export interface TokenVerifier {
  /** The token's claims, or null when it is not a valid, unexpired access token of this project. */
  verify(token: string): Promise<SupabaseClaims | null>;
}

export interface VerifierOptions {
  /** https://<project>.supabase.co: the issuer is <url>/auth/v1 and the keys come from its JWKS endpoint. */
  url: string;
  /** For HS256 projects. Without it, only asymmetric keys from the JWKS endpoint are accepted. */
  jwtSecret?: string;
  fetch?: typeof fetch;
  /** How long fetched keys are trusted before they are fetched again. */
  jwksCacheMs?: number;
}

const b64url = (s: string) => Buffer.from(s, 'base64url');

export function supabaseVerifier(options: VerifierOptions): TokenVerifier {
  const issuer = `${options.url.replace(/\/$/, '')}/auth/v1`;
  const doFetch = options.fetch ?? fetch;
  let keys: { at: number; byKid: Map<string, KeyObject> } | null = null;

  async function keyFor(kid: string | undefined): Promise<KeyObject | null> {
    const fresh = keys && Date.now() - keys.at < (options.jwksCacheMs ?? 10 * 60_000);
    // An unknown kid may be a rotated key: fetch again once.
    if (!fresh || (kid && !keys!.byKid.has(kid))) {
      const response = await doFetch(`${issuer}/.well-known/jwks.json`);
      if (!response.ok) return null;
      const { keys: list } = (await response.json()) as { keys: (JsonWebKey & { kid?: string })[] };
      keys = { at: Date.now(), byKid: new Map(list.map((k) => [k.kid ?? '', createPublicKey({ key: k, format: 'jwk' })])) };
    }
    return keys!.byKid.get(kid ?? '') ?? (keys!.byKid.size === 1 ? [...keys!.byKid.values()][0]! : null);
  }

  return {
    async verify(token) {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [h, p, s] = parts as [string, string, string];
      let header: { alg?: string; kid?: string };
      let payload: Record<string, unknown>;
      try {
        header = JSON.parse(b64url(h).toString('utf8'));
        payload = JSON.parse(b64url(p).toString('utf8'));
      } catch {
        return null;
      }
      const signed = Buffer.from(`${h}.${p}`);
      const signature = b64url(s);
      let ok = false;
      if (header.alg === 'HS256') {
        if (!options.jwtSecret) return null;
        const expected = createHmac('sha256', options.jwtSecret).update(signed).digest();
        ok = expected.length === signature.length && timingSafeEqual(expected, signature);
      } else if (header.alg === 'ES256' || header.alg === 'RS256') {
        const key = await keyFor(header.kid);
        if (!key) return null;
        ok = verifySignature('sha256', signed, header.alg === 'ES256' ? { key, dsaEncoding: 'ieee-p1363' } : key, signature);
      }
      if (!ok) return null;

      const now = Math.floor(Date.now() / 1000);
      if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
      if (payload.iss !== issuer || payload.aud !== 'authenticated' || payload.role !== 'authenticated') return null;
      if (typeof payload.sub !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.sub)) return null;
      return {
        sub: payload.sub,
        email: typeof payload.email === 'string' && payload.email ? payload.email.toLowerCase() : null,
        aal: payload.aal === 'aal2' ? 'aal2' : 'aal1',
        amr: Array.isArray(payload.amr)
          ? payload.amr.filter((a): a is { method: string; timestamp: number } => typeof a?.method === 'string' && typeof a?.timestamp === 'number')
          : [],
        exp: payload.exp,
      };
    },
  };
}

/** Staff routes need a TOTP check in this session no older than this (engineering plan: 12-hour staff sessions). */
export const STAFF_MFA_MAX_AGE_HOURS = 12;

export function hasFreshMfa(claims: SupabaseClaims, now = Date.now()): boolean {
  if (claims.aal !== 'aal2') return false;
  const totp = claims.amr.filter((a) => a.method === 'totp').map((a) => a.timestamp * 1000);
  return totp.some((at) => now - at <= STAFF_MFA_MAX_AGE_HOURS * 3_600_000 && at <= now + 60_000);
}

/** Supabase Auth admin calls the API needs: deleting a user's sign-in on account deletion, banning (US-33, US-34). */
export interface SupabaseAdmin {
  deleteUser(authUserId: string): Promise<void>;
  banUser(authUserId: string): Promise<void>;
}

export function supabaseAdmin(options: { url: string; serviceRoleKey: string; fetch?: typeof fetch }): SupabaseAdmin {
  const base = `${options.url.replace(/\/$/, '')}/auth/v1/admin/users`;
  const doFetch = options.fetch ?? fetch;
  const headers = { apikey: options.serviceRoleKey, authorization: `Bearer ${options.serviceRoleKey}`, 'content-type': 'application/json' };
  return {
    async deleteUser(id) {
      const response = await doFetch(`${base}/${id}`, { method: 'DELETE', headers });
      if (!response.ok && response.status !== 404) throw new Error(`Supabase admin answered ${response.status}`);
    },
    async banUser(id) {
      // 100 years: Supabase has no "forever"; our own banned_at check refuses the account in any case.
      const response = await doFetch(`${base}/${id}`, { method: 'PUT', headers, body: JSON.stringify({ ban_duration: '876000h' }) });
      if (!response.ok && response.status !== 404) throw new Error(`Supabase admin answered ${response.status}`);
    },
  };
}
