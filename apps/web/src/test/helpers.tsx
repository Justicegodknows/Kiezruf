import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { AuthProvider } from '@/auth/AuthProvider';
import { I18nProvider } from '@/i18n/I18nProvider';

export function renderWithProviders(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider locale="de">
        <AuthProvider>{ui}</AuthProvider>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

export interface Call {
  method: string;
  path: string;
  body: unknown;
}

type Handler = (call: Call) => { status?: number; body?: unknown } | undefined;

/** Replaces fetch with a router over `METHOD /api/path` and records every call. */
export function mockFetch(handler: Handler) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
    const call = { method, path: url.pathname + url.search, body };
    calls.push(call);
    const answer = handler(call) ?? { status: 404, body: { error: 'not_found' } };
    const status = answer.status ?? 200;
    return new Response(answer.body === undefined || status === 204 ? null : JSON.stringify(answer.body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

export function mockGeolocation(fix: { lat: number; lon: number; accuracy: number }) {
  const getCurrentPosition = vi.fn((ok: PositionCallback) =>
    ok({ coords: { latitude: fix.lat, longitude: fix.lon, accuracy: fix.accuracy } } as GeolocationPosition),
  );
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
  return getCurrentPosition;
}
