import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const app = buildApp();
beforeAll(() => app.ready());
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

// Citizen endpoints must never expose the staff-only score (US-24). Turn these into real tests with the first report route.
describe('citizen report endpoints (US-24)', () => {
  it.todo('GET /reports/:id has no "score" or "level" field for a citizen session');
  it.todo('GET /reports (map and list) has no "score" or "level" field');
  it.todo('the OpenAPI schema for citizen responses does not declare "score" or "level"');
});
