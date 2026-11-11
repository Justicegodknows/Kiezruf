import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeMailer, FakePhotoStorage } from '../test/support/fakes.js';
import { buildApp } from './app.js';
import type { Db } from './db/client.js';

// No database: these routes never touch it. Routes that do are covered by test/integration.
let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp({
    db: {} as Db,
    mailer: new FakeMailer(),
    storage: new FakePhotoStorage(),
    authSecret: 'unit-test-secret-at-least-32-characters',
    publicPhotoBaseUrl: 'https://photos.test',
    webBaseUrl: 'https://kiezruf.test',
  });
  await app.ready();
});
afterAll(() => app.close());

describe('GET /health', () => {
  it('answers 200 with ok: true', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });

  it('uses the shared score rules (sample report is Critical)', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.json().sampleLevel).toBe('Critical');
  });
});

describe('unknown routes', () => {
  it('answers 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/no-such-route' });
    expect(res.statusCode).toBe(404);
  });
});

describe('request validation', () => {
  it('answers 401 without a session on citizen routes', async () => {
    for (const [method, url] of [['POST', '/reports'], ['POST', '/uploads'], ['GET', '/me'], ['PUT', '/reports/BE-NK-2026-0001/me-too']] as const) {
      const res = await app.inject({ method, url, payload: {} });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
      expect(res.json()).toEqual({ error: 'unauthorized' });
    }
  });

  it('answers 401 for a malformed bearer header without asking the database', async () => {
    const res = await app.inject({ method: 'GET', url: '/me', headers: { authorization: 'Bearer short' } });
    expect(res.statusCode).toBe(401);
  });

  it('answers 400 with the failing fields for a bad sign-in request', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/code', payload: { email: 'not-an-email' } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid_request', fields: ['email'] });
  });

  it('answers 400 for a malformed report ID', async () => {
    const res = await app.inject({ method: 'GET', url: "/public/reports/BE-NK-2026-0001'" });
    expect(res.statusCode).toBe(400);
  });
});

// Citizen endpoints must never expose the staff-only score (US-24). The response tests are in
// test/integration/citizen-api.int.test.ts; the schema test waits for the OpenAPI spec.
describe('citizen report endpoints (US-24)', () => {
  it.todo('the OpenAPI schema for citizen responses does not declare "score" or "level"');
});
