import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { accessToken, authUserIdFor, TEST_JWT_SECRET, TEST_SUPABASE_URL } from '../../test/support/tokens.js';
import { hasFreshMfa, supabaseAdmin, supabaseVerifier } from './supabase.js';

const verifier = supabaseVerifier({ url: TEST_SUPABASE_URL, jwtSecret: TEST_JWT_SECRET });

describe('Supabase access tokens (ENG-22)', () => {
  it('accepts a valid HS256 token and reads its claims', async () => {
    const claims = await verifier.verify(accessToken({ email: 'Anna@Example.org' }));
    expect(claims).toMatchObject({ sub: authUserIdFor('anna@example.org'), email: 'anna@example.org', aal: 'aal1' });
  });

  it('reads the invited mark only from app_metadata, which users cannot change (ENG-24)', async () => {
    expect((await verifier.verify(accessToken({ email: 'a@example.org' })))!.invited).toBe(false);
    expect((await verifier.verify(accessToken({ email: 'a@example.org', invited: true })))!.invited).toBe(true);
    const viaUserMetadata = accessToken({ email: 'a@example.org', overrides: { user_metadata: { kiezruf_invited: true } } });
    expect((await verifier.verify(viaUserMetadata))!.invited).toBe(false);
  });

  it.each([
    ['expired', accessToken({ email: 'a@example.org', expiresInSeconds: -1 })],
    ['signed with another secret', accessToken({ email: 'a@example.org', secret: 'x'.repeat(40) })],
    ['for another project', accessToken({ email: 'a@example.org', overrides: { iss: 'https://evil.supabase.co/auth/v1' } })],
    ['not an access token', accessToken({ email: 'a@example.org', overrides: { role: 'service_role' } })],
    ['for another audience', accessToken({ email: 'a@example.org', overrides: { aud: 'other' } })],
    ['malformed', 'not.a.jwt'],
  ])('refuses a token %s', async (_label, token) => {
    expect(await verifier.verify(token)).toBeNull();
  });

  it('refuses alg "none" and HS256 without a configured secret', async () => {
    const enc = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const none = `${enc({ alg: 'none' })}.${enc({ sub: authUserIdFor('a@b.c'), exp: 9e9 })}.`;
    expect(await verifier.verify(none)).toBeNull();
    expect(await supabaseVerifier({ url: TEST_SUPABASE_URL }).verify(accessToken({ email: 'a@example.org' }))).toBeNull();
  });

  it('verifies ES256 tokens with keys from the JWKS endpoint, and caches them', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    let fetches = 0;
    const fetchJwks = (async () => {
      fetches++;
      return { ok: true, json: async () => ({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'ES256' }] }) } as Response;
    }) as unknown as typeof fetch;
    const es = supabaseVerifier({ url: TEST_SUPABASE_URL, fetch: fetchJwks });
    const enc = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${enc({ alg: 'ES256', kid: 'k1' })}.${enc({ iss: `${TEST_SUPABASE_URL}/auth/v1`, aud: 'authenticated', role: 'authenticated', sub: authUserIdFor('es@example.org'), email: 'es@example.org', exp: now + 60 })}`;
    const sig = sign('sha256', Buffer.from(unsigned), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    expect(await es.verify(`${unsigned}.${sig}`)).toMatchObject({ email: 'es@example.org' });
    expect(await es.verify(`${unsigned}.${sig}`)).not.toBeNull();
    expect(fetches).toBe(1);
    expect(await es.verify(`${unsigned}.${Buffer.from('bad').toString('base64url')}`)).toBeNull();
  });
});

describe('staff MFA freshness', () => {
  const claims = async (o: Parameters<typeof accessToken>[0]) => (await verifier.verify(accessToken(o)))!;

  it('needs aal2 with a TOTP check at most 12 hours old', async () => {
    expect(hasFreshMfa(await claims({ email: 's@example.org', mfa: true }))).toBe(true);
    expect(hasFreshMfa(await claims({ email: 's@example.org' }))).toBe(false);
    expect(hasFreshMfa(await claims({ email: 's@example.org', mfa: true, mfaAgeSeconds: 12 * 3600 + 60 }))).toBe(false);
  });
});

describe('Supabase admin', () => {
  it('creates an invited, confirmed user and reports an address that already has one', async () => {
    const bodies: unknown[] = [];
    let taken = false;
    const admin = supabaseAdmin({
      url: TEST_SUPABASE_URL,
      serviceRoleKey: 'service-key',
      fetch: (async (_url: string, init: { body?: string }) => {
        bodies.push(JSON.parse(init.body!));
        if (taken) return new Response(JSON.stringify({ code: 422, error_code: 'email_exists', msg: 'exists' }), { status: 422 });
        return new Response(JSON.stringify({ id: 'u-new' }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(await admin.createInvitedUser('a@example.org', 'temporary-pass')).toEqual({ id: 'u-new' });
    expect(bodies[0]).toEqual({ email: 'a@example.org', password: 'temporary-pass', email_confirm: true, app_metadata: { kiezruf_invited: true } });
    taken = true;
    expect(await admin.createInvitedUser('a@example.org', 'temporary-pass')).toBeNull();
  });

  it('deletes and bans users with the service-role key, ignoring users already gone', async () => {
    const calls: { url: string; method: string; body?: string; key: string }[] = [];
    const admin = supabaseAdmin({
      url: TEST_SUPABASE_URL,
      serviceRoleKey: 'service-key',
      fetch: (async (url: string, init: { method: string; body?: string; headers: Record<string, string> }) => {
        calls.push({ url, method: init.method, body: init.body, key: init.headers.apikey! });
        return { ok: url.endsWith('gone') ? false : true, status: url.endsWith('gone') ? 404 : 200 } as Response;
      }) as unknown as typeof fetch,
    });
    await admin.deleteUser('u1');
    await admin.banUser('u2');
    await admin.deleteUser('gone');
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ['DELETE', `${TEST_SUPABASE_URL}/auth/v1/admin/users/u1`],
      ['PUT', `${TEST_SUPABASE_URL}/auth/v1/admin/users/u2`],
      ['DELETE', `${TEST_SUPABASE_URL}/auth/v1/admin/users/gone`],
    ]);
    expect(calls[1]!.body).toBe('{"ban_duration":"876000h"}');
    expect(calls.every((c) => c.key === 'service-key')).toBe(true);
  });
});
