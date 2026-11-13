// The Supabase session is stored in chunks in expo-secure-store (mocked in jest.setup.ts as an in-memory map),
// because one SecureStore value should stay under 2048 bytes. Also: Supabase auth errors map to translated codes.
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { signInErrorCode } from '../src/auth/authErrors';
import { CHUNK_BYTES, createChunkedSecureStorage, splitUtf8 } from '../src/auth/secureStorage';
import { de } from '../src/i18n/de';
import { en } from '../src/i18n/en';

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;
const bytes = (s: string) => encodeURIComponent(s).replace(/%[0-9A-F]{2}/g, 'x').length; // UTF-8 length

/** A session shaped like Supabase's: two JWTs and the user object, with umlauts and an emoji in the metadata. */
function largeSession(): string {
  const jwt = (n: number) => `eyJ${'x'.repeat(n)}.eyJ${'y'.repeat(n)}.${'z'.repeat(86)}`;
  return JSON.stringify({
    access_token: jwt(1200),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 1_800_000_000,
    refresh_token: 'r'.repeat(40),
    user: {
      id: '7f9c2c1e-0000-4000-8000-000000000000',
      email: 'jürgen.müller@example.de',
      user_metadata: { locale: 'de', note: 'Straßenbeleuchtung 🚧 '.repeat(250) },
      identities: Array.from({ length: 3 }, (_, i) => ({ id: `identity-${i}`, provider: 'email', identity_data: { email_verified: true } })),
    },
  });
}

describe('chunked secure storage', () => {
  test('a large session round-trips, and no stored value exceeds the chunk limit', async () => {
    const storage = createChunkedSecureStorage();
    const session = largeSession();
    expect(bytes(session)).toBeGreaterThan(4 * 2048);

    await storage.setItem('kiezruf.auth', session);
    expect(await storage.getItem('kiezruf.auth')).toBe(session);

    const chunks = Number(store.get('kiezruf.auth.n'));
    expect(chunks).toBeGreaterThan(4);
    for (const [key, value] of store) {
      expect(key).toMatch(/^[A-Za-z0-9._-]+$/); // SecureStore's allowed key characters
      expect(bytes(value)).toBeLessThanOrEqual(CHUNK_BYTES);
    }
  });

  test('a shorter value replaces a longer one without leftover chunks; remove deletes everything', async () => {
    const storage = createChunkedSecureStorage();
    await storage.setItem('kiezruf.auth', largeSession());
    await storage.setItem('kiezruf.auth', '{"short":true}');
    expect(await storage.getItem('kiezruf.auth')).toBe('{"short":true}');
    expect([...store.keys()].sort()).toEqual(['kiezruf.auth.0', 'kiezruf.auth.n']);

    await storage.removeItem('kiezruf.auth');
    expect(await storage.getItem('kiezruf.auth')).toBeNull();
    expect(store.size).toBe(0);
  });

  test('a missing chunk or count reads as no session', async () => {
    const storage = createChunkedSecureStorage();
    expect(await storage.getItem('kiezruf.auth')).toBeNull();
    await storage.setItem('kiezruf.auth', largeSession());
    store.delete('kiezruf.auth.1');
    expect(await storage.getItem('kiezruf.auth')).toBeNull();
  });

  test('writes run one after another', async () => {
    const storage = createChunkedSecureStorage();
    await Promise.all([storage.setItem('k', largeSession()), storage.setItem('k', 'second'), storage.removeItem('k'), storage.setItem('k', 'last')]);
    expect(await storage.getItem('k')).toBe('last');
    expect([...store.keys()].sort()).toEqual(['k.0', 'k.n']);
  });

  test('splitting never cuts a character in half', () => {
    const text = 'ä€🚧'.repeat(500);
    const parts = splitUtf8(text, 100);
    expect(parts.join('')).toBe(text);
    for (const part of parts) {
      expect(bytes(part)).toBeLessThanOrEqual(100);
      expect(part).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
    }
    expect(splitUtf8('')).toEqual(['']);
  });
});

describe('Supabase auth errors', () => {
  test.each([
    [new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'), 'sign-in', 'invalid_credentials'],
    [new AuthApiError('bad', 400, undefined), 'sign-in', 'invalid_credentials'],
    [new AuthApiError('User already registered', 422, 'user_already_exists'), 'sign-up', 'email_taken'],
    [new AuthApiError('Password should be at least 10 characters', 422, 'weak_password'), 'sign-up', 'weak_password'],
    [new AuthApiError('Request rate limit reached', 429, 'over_request_rate_limit'), 'sign-in', 'too_many_attempts'],
    [new AuthApiError('invalid', 400, 'email_address_invalid'), 'sign-up', 'email_invalid'],
    [new AuthRetryableFetchError('Failed to fetch', 0), 'sign-up', 'network'],
    [new AuthApiError('boom', 500, 'unexpected_failure'), 'sign-up', 'unknown'],
    [new Error('not an auth error'), 'sign-in', 'unknown'],
  ] as const)('%s on %s → %s', (error, step, code) => {
    expect(signInErrorCode(error, step)).toBe(code);
  });

  test('every code the sheet can show has German and English text', () => {
    for (const code of ['invalid_credentials', 'weak_password', 'email_taken', 'too_many_attempts', 'network', 'unknown', 'invalid_request'] as const) {
      expect(de.errors[code]).toBeTruthy();
      expect(en.errors[code]).not.toBe(de.errors[code]);
    }
  });
});

describe('the real Supabase client', () => {
  test('starts without a stored session and reads its session from the chunked secure storage', async () => {
    jest.unmock('react-native-url-polyfill/auto');
    const fetchSpy = jest.fn(async () => {
      throw new Error('no network in tests');
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined); // no publishable key in tests
    const { supabase } = jest.requireActual<typeof import('../src/auth/supabase')>('../src/auth/supabase');
    try {
      expect((await supabase.auth.getSession()).data.session).toBeNull();
      // A session written by a previous run (as chunks) is found again under the client's storage key.
      const session = { access_token: 'stored', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1', email: 'jürgen@example.de', user_metadata: { note: 'ä'.repeat(3000) } } };
      await createChunkedSecureStorage().setItem('kiezruf.auth', JSON.stringify(session));
      expect(Number(store.get('kiezruf.auth.n'))).toBeGreaterThan(1);
      expect((await supabase.auth.getSession()).data.session?.access_token).toBe('stored');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      await supabase.auth.stopAutoRefresh();
    }
  });
});
