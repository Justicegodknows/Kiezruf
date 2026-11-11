import { describe, expect, it } from 'vitest';
import { expoPushSender } from './push.js';

const message = (to: string) => ({ to, title: 'Kiezruf', body: 'Update', data: { publicId: 'BE-NK-2026-0001' } });

function fakeFetch(answer: (body: unknown[]) => { status: number; json?: unknown }) {
  const calls: unknown[][] = [];
  const impl = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as unknown[];
    calls.push(body);
    const { status, json } = answer(body);
    return { ok: status < 400, status, json: async () => json } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('expoPushSender', () => {
  it('maps Expo tickets to results, marking DeviceNotRegistered as unregistered', async () => {
    const { impl } = fakeFetch(() => ({
      status: 200,
      json: { data: [{ status: 'ok', id: '1' }, { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }, { status: 'error', message: 'too big', details: { error: 'MessageTooBig' } }] },
    }));
    const results = await expoPushSender({ fetch: impl }).send([message('a'), message('b'), message('c')]);
    expect(results).toEqual([
      { ok: true },
      { ok: false, unregistered: true, error: 'gone' },
      { ok: false, unregistered: false, error: 'too big' },
    ]);
  });

  it('sends in chunks of 100', async () => {
    const { impl, calls } = fakeFetch((body) => ({ status: 200, json: { data: body.map(() => ({ status: 'ok' })) } }));
    const results = await expoPushSender({ fetch: impl }).send(Array.from({ length: 150 }, (_, i) => message(`t${i}`)));
    expect(calls.map((c) => c.length)).toEqual([100, 50]);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('treats an HTTP error as a retryable failure for every message', async () => {
    const { impl } = fakeFetch(() => ({ status: 503 }));
    expect(await expoPushSender({ fetch: impl }).send([message('a')])).toEqual([
      { ok: false, unregistered: false, error: 'Expo push answered 503' },
    ]);
  });
});
