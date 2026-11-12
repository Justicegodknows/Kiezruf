// A stand-in for @supabase/ssr's createServerClient in server tests. It keeps the session in one cookie
// (`sb-test-auth-token`, whose value is the access token) and writes changes through the `setAll` the code under
// test passes in, as the real client does. Use with:
//   vi.mock('@supabase/ssr', async () => (await import('@/test/fake-supabase')).ssrModule);
import { vi } from 'vitest';

export const AUTH_COOKIE = 'sb-test-auth-token';

type CookieOptions = Record<string, unknown>;
type SetAll = (cookies: { name: string; value: string; options: CookieOptions }[], headers: Record<string, string>) => void;

interface Options {
  cookieOptions?: CookieOptions;
  cookies: { getAll: () => { name: string; value: string }[] | null; setAll?: SetAll };
}

export interface TokenInfo {
  aal: 'aal1' | 'aal2';
  /** Seconds since the epoch of the last TOTP check (for `amr`). */
  totpAt?: number;
  email?: string;
}

export interface FakeFactor {
  id: string;
  factor_type: 'totp';
  status: 'verified' | 'unverified';
  created_at: string;
  updated_at: string;
}

type Err = { code: string; status: number; message?: string } | null;

export const fake = {
  /** Valid access tokens and what they carry. */
  tokens: {} as Record<string, TokenInfo>,
  /** Expired tokens and the token a refresh turns them into. */
  refresh: {} as Record<string, string>,
  factors: [] as FakeFactor[],
  /** The email code verifyOtp accepts, and the TOTP code mfa.verify accepts. */
  emailCode: '123456',
  totpCode: '654321',
  /** Errors to return instead, by method name (e.g. `signInWithOtp`). */
  errors: {} as Record<string, Err>,
  /** Every Supabase call, with its arguments. */
  calls: [] as { method: string; args: unknown }[],
  /** The arguments createServerClient was last called with. */
  created: [] as { url: string; key: string; options: Options }[],
  reset() {
    this.tokens = {};
    this.refresh = {};
    this.factors = [];
    this.errors = {};
    this.calls = [];
    this.created = [];
  },
};

export const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect fill="#000" width="10" height="10"/></svg>';

function createServerClient(url: string, key: string, options: Options) {
  fake.created.push({ url, key, options });
  const base = { path: '/', sameSite: 'lax', httpOnly: false, maxAge: 400 * 24 * 60 * 60, ...options.cookieOptions };
  const write = (value: string) => {
    options.cookies.setAll?.(
      [{ name: AUTH_COOKIE, value, options: value ? base : { ...base, maxAge: 0 } }],
      { 'cache-control': 'private, no-cache, no-store, must-revalidate, max-age=0', expires: '0', pragma: 'no-cache' },
    );
  };
  const record = (method: string, args?: unknown) => fake.calls.push({ method, args });
  const current = (): string | null => {
    const value = options.cookies.getAll()?.find((c) => c.name === AUTH_COOKIE)?.value ?? null;
    if (!value) return null;
    if (fake.tokens[value]) return value;
    const refreshed = fake.refresh[value];
    if (refreshed && fake.tokens[refreshed]) {
      write(refreshed);
      return refreshed;
    }
    return null;
  };
  const failure = (method: string) => fake.errors[method] ?? null;
  const signIn = (token: string, info: TokenInfo) => {
    fake.tokens[token] = info;
    write(token);
  };

  return {
    auth: {
      getSession: vi.fn(async () => {
        const token = current();
        return { data: { session: token ? { access_token: token } : null }, error: null };
      }),
      getClaims: vi.fn(async () => {
        const token = current();
        if (!token) return { data: null, error: null };
        const info = fake.tokens[token]!;
        const amr = [{ method: 'otp', timestamp: 1 }, ...(info.totpAt ? [{ method: 'totp', timestamp: info.totpAt }] : [])];
        return { data: { claims: { aal: info.aal, amr, iat: Math.floor(Date.now() / 1000) } }, error: null };
      }),
      signInWithOtp: vi.fn(async (args: unknown) => {
        record('signInWithOtp', args);
        return { data: {}, error: failure('signInWithOtp') };
      }),
      verifyOtp: vi.fn(async (args: { email: string; token: string; type: string }) => {
        record('verifyOtp', args);
        if (failure('verifyOtp') || args.token !== fake.emailCode) {
          return { data: { session: null, user: null }, error: failure('verifyOtp') ?? { code: 'otp_expired', status: 403 } };
        }
        signIn('tok_aal1_fresh_session_token', { aal: 'aal1', email: args.email });
        return { data: { session: { access_token: 'tok_aal1_fresh_session_token' }, user: { email: args.email } }, error: null };
      }),
      signOut: vi.fn(async (args: unknown) => {
        record('signOut', args);
        write('');
        return { error: null };
      }),
      mfa: {
        listFactors: vi.fn(async () => {
          record('listFactors');
          if (failure('listFactors')) return { data: null, error: failure('listFactors') };
          return { data: { all: fake.factors, totp: fake.factors.filter((f) => f.status === 'verified'), phone: [], webauthn: [] }, error: null };
        }),
        unenroll: vi.fn(async (args: { factorId: string }) => {
          record('unenroll', args);
          fake.factors = fake.factors.filter((f) => f.id !== args.factorId);
          return { data: { id: args.factorId }, error: null };
        }),
        enroll: vi.fn(async (args: unknown) => {
          record('enroll', args);
          if (failure('enroll')) return { data: null, error: failure('enroll') };
          fake.factors.push({ id: 'factor-new', factor_type: 'totp', status: 'unverified', created_at: '2026-11-12T10:00:00Z', updated_at: '2026-11-12T10:00:00Z' });
          return {
            data: {
              id: 'factor-new',
              type: 'totp',
              friendly_name: 'Kiezruf',
              totp: { qr_code: `data:image/svg+xml;utf-8,${SVG}`, secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/Kiezruf?secret=JBSWY3DPEHPK3PXP' },
            },
            error: null,
          };
        }),
        challenge: vi.fn(async (args: { factorId: string }) => {
          record('challenge', args);
          return { data: { id: 'challenge-1', type: 'totp', expires_at: 0 }, error: failure('challenge') };
        }),
        verify: vi.fn(async (args: { factorId: string; challengeId: string; code: string }) => {
          record('verify', args);
          if (failure('verify') || args.code !== fake.totpCode) return { data: null, error: failure('verify') ?? { code: 'mfa_verification_failed', status: 422 } };
          fake.factors = fake.factors.map((f) => (f.id === args.factorId ? { ...f, status: 'verified' } : f));
          signIn('tok_aal2_fresh_session_token', { aal: 'aal2', totpAt: Math.floor(Date.now() / 1000) });
          return { data: { access_token: 'tok_aal2_fresh_session_token' }, error: null };
        }),
        getAuthenticatorAssuranceLevel: vi.fn(async () => {
          const token = current();
          return { data: { currentLevel: token ? fake.tokens[token]!.aal : null, nextLevel: null, currentAuthenticationMethods: [] }, error: null };
        }),
      },
    },
  };
}

export const ssrModule = { createServerClient };

/** Supabase settings the code under test reads from the environment. */
export function stubSupabaseEnv(stubEnv: (name: string, value: string) => unknown) {
  stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.test');
  stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'sb_publishable_test');
  stubEnv('API_BASE_URL', 'http://api.test');
}
