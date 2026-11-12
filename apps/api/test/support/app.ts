import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import type { Db } from '../../src/db/client.js';
import type { AppDeps } from '../../src/deps.js';
import { FakeMailer, FakePhotoStorage } from './fakes.js';

export const TEST_AUTH_SECRET = 'test-secret-that-is-at-least-32-characters-long';

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
    authSecret: TEST_AUTH_SECRET,
    publicPhotoBaseUrl: 'https://photos.test/public',
    webBaseUrl: 'https://kiezruf.test',
    rateLimits: false,
    ...overrides,
  };
  const app = await buildApp(deps);
  await app.ready();
  return { app, mailer, storage, deps };
}

/** Signs in through the real one-time-code flow and returns the session token. */
export async function signIn(t: TestApp, email: string): Promise<string> {
  const code = await t.app.inject({ method: 'POST', url: '/auth/code', payload: { email } });
  if (code.statusCode !== 202) throw new Error(`POST /auth/code answered ${code.statusCode}: ${code.body}`);
  const verify = await t.app.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { email, code: t.mailer.lastCodeFor(email) },
  });
  if (verify.statusCode !== 200) throw new Error(`POST /auth/verify answered ${verify.statusCode}: ${verify.body}`);
  return verify.json().token as string;
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
