import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { supabaseVerifier } from '../../src/auth/supabase.js';
import type { Db } from '../../src/db/client.js';
import type { AppDeps } from '../../src/deps.js';
import { FakeMailer, FakePhotoStorage } from './fakes.js';
import { accessToken, TEST_JWT_SECRET, TEST_SUPABASE_URL } from './tokens.js';


export interface TestApp {
  app: FastifyInstance;
  mailer: FakeMailer;
  storage: FakePhotoStorage;
  deps: AppDeps;
}

export async function buildTestApp(db: Db, overrides: Partial<AppDeps> = {}): Promise<TestApp> {
  const mailer = new FakeMailer();
  const storage = new FakePhotoStorage();
  const deps: AppDeps = {
    db,
    mailer,
    storage,
    verifier: supabaseVerifier({ url: TEST_SUPABASE_URL, jwtSecret: TEST_JWT_SECRET }),
    publicPhotoBaseUrl: 'https://photos.test/public',
    webBaseUrl: 'https://kiezruf.test',
    rateLimits: false,
    ...overrides,
  };
  const app = await buildApp(deps);
  await app.ready();
  return { app, mailer, storage, deps };
}

/**
 * A Supabase access token for `email`, as the clients get after the email code (ENG-22). The account is created on the
 * first API call. `t` is kept for the old call shape.
 */
export async function signIn(t: TestApp, email: string): Promise<string> {
  const token = accessToken({ email });
  // The first API call creates the account, as it does for real clients.
  const me = await t.app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } });
  if (me.statusCode !== 200) throw new Error(`GET /me answered ${me.statusCode}: ${me.body}`);
  return token;
}

/** Uploads a real photo's bytes to the fake storage and returns its key. */
export async function uploadPhotoBytes(t: TestApp, token: string, body: Buffer): Promise<string> {
  const [key] = await uploadPhotos(t, token, 1);
  t.storage.objects.set(key!, body);
  return key!;
}

/** Uploads `count` photos (fake storage) and returns their keys. */
export async function uploadPhotos(t: TestApp, token: string, count = 1): Promise<string[]> {
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    const res = await t.app.inject({
      method: 'POST',
      url: '/uploads',
      headers: { authorization: `Bearer ${token}` },
      payload: { contentType: 'image/jpeg' },
    });
    if (res.statusCode !== 201) throw new Error(`POST /uploads answered ${res.statusCode}: ${res.body}`);
    keys.push(res.json().key);
  }
  return keys;
}
