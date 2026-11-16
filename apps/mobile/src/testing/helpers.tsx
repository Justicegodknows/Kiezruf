// Test helpers: a fake API behind global fetch, and a render with the app's providers.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AuthProvider } from '../auth/AuthProvider';
import { SignInSheet } from '../auth/SignInSheet';
import { type Draft, DraftProvider, EMPTY_DRAFT } from '../report/DraftProvider';
import { setFakeSession } from './fakeSupabase';

export interface Call {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}

type Reply = { status?: number; body?: unknown } | ((call: Call) => { status?: number; body?: unknown });

/**
 * Replaces global fetch. Keys are "METHOD /path" (no query string). Unknown routes answer 404 not_found.
 * Returns the list of calls made, in order.
 */
export function mockApi(routes: Record<string, Reply>): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const call: Call = {
      method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);
    const route = routes[`${method} ${url.pathname}`] ?? routes[`${method} ${url.origin}${url.pathname}`];
    const reply = typeof route === 'function' ? route(call) : (route ?? { status: 404, body: { error: 'not_found' } });
    const status = reply.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => reply.body,
      blob: async () => ({ size: 1 }),
    } as unknown as Response;
  }) as typeof fetch;
  return calls;
}

/** Starts the test with a stored Supabase session whose access token is `token`. */
export async function signInAs(token = 'test-token') {
  setFakeSession(token);
}

const clients: QueryClient[] = [];
// Query and mutation caches keep garbage-collection timers; clear them so Jest can exit.
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

export function renderApp(ui: ReactElement, { draft = EMPTY_DRAFT }: { draft?: Draft } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <DraftProvider initial={draft}>
          {ui}
          <SignInSheet />
        </DraftProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

/** Routes the app calls right after sign-in (the language goes to PATCH /me). Sign-in itself is the fake Supabase. */
export const SIGN_IN_ROUTES = {
  'PATCH /me': { status: 204 },
};
