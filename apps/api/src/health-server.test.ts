import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { startHealthServer } from './health-server.js';

let server: Server | undefined;
afterEach(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())));

async function start() {
  server = await startHealthServer(0, '127.0.0.1');
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('worker health server', () => {
  it('answers GET /health with 200', async () => {
    const base = await start();
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('answers every other path or method with 404', async () => {
    const base = await start();
    expect((await fetch(`${base}/`)).status).toBe(404);
    expect((await fetch(`${base}/health`, { method: 'POST' })).status).toBe(404);
  });
});
