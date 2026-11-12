// In-memory stand-in for src/auth/supabase.ts in jest (jest.setup.ts). No network, no storage.
// verifyOtp accepts any code and signs in with the access token "fresh-token"; tests override single calls
// with mockResolvedValueOnce. Auth events are delivered like supabase-js does: INITIAL_SESSION after subscribing,
// SIGNED_IN after verifyOtp, SIGNED_OUT after signOut.
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

type Listener = (event: AuthChangeEvent, session: Session | null) => void;

let session: Session | null = null;
const listeners = new Set<Listener>();

export function fakeSession(accessToken: string, email = 'name@example.de'): Session {
  return {
    access_token: accessToken,
    refresh_token: `refresh-${accessToken}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'user-1', email, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  } as Session;
}

function emit(event: AuthChangeEvent) {
  for (const listener of [...listeners]) listener(event, session);
}

const auth = {
  signInWithOtp: jest.fn(async (_credentials: { email: string; options?: object }) => ({
    data: { user: null, session: null },
    error: null as unknown,
  })),
  verifyOtp: jest.fn(async (params: { email: string; token: string; type: 'email' }) => {
    session = fakeSession('fresh-token', params.email);
    emit('SIGNED_IN');
    return { data: { user: session.user, session }, error: null as unknown };
  }),
  signOut: jest.fn(async (_options?: { scope?: 'global' | 'local' | 'others' }) => {
    session = null;
    emit('SIGNED_OUT');
    return { error: null as unknown };
  }),
  getSession: jest.fn(async () => ({ data: { session }, error: null })),
  onAuthStateChange: jest.fn((callback: Listener) => {
    listeners.add(callback);
    void Promise.resolve().then(() => listeners.has(callback) && callback('INITIAL_SESSION', session));
    return { data: { subscription: { id: 'fake', callback, unsubscribe: () => void listeners.delete(callback) } } };
  }),
  startAutoRefresh: jest.fn(async () => undefined),
  stopAutoRefresh: jest.fn(async () => undefined),
};

export const supabase = { auth };
export const fakeAuth = auth;

/** The stored session's access token, or null when signed out. */
export const fakeAccessToken = () => session?.access_token ?? null;

/** Starts a test signed in (as if a session had been stored on a previous run), or signed out with null. */
export function setFakeSession(accessToken: string | null) {
  session = accessToken ? fakeSession(accessToken) : null;
}

export function resetFakeSupabase() {
  session = null;
  listeners.clear();
}
