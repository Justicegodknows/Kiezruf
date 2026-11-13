// Sessions (US-01, ENG-22). Sign-in is Supabase Auth: supabase-js keeps the session in secure storage
// (src/auth/secureStorage.ts) and refreshes it while the app is in the foreground. Every API request carries the
// current access token as Authorization: Bearer (src/api/client.ts).
// requireSignIn() is the "sign in only to act" rule: it runs the action at once for a signed-in citizen, and
// otherwise opens the sign-in sheet and runs the same action on its own after the code is confirmed.
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { setAccessTokenProvider, setUnauthorizedHandler } from '../api/client';
import { updateMe } from '../api/endpoints';
import { currentLocale } from '../i18n';
import { forgetPushToken, type PushStatus, registerForPush, unregisterPush } from '../push/push';
import { supabase } from './supabase';

/** 'add': "Add my photo to this report" on "Already reported?" (US-13). */
export type SignInVerb = 'post' | 'comment' | 'vote' | 'follow' | 'add' | 'continue';

/** Where the API's own session token lived before Supabase Auth. Deleted on start; it is no longer valid. */
const LEGACY_TOKEN_KEY = 'kiezruf.session';

// getSession() returns the stored session and refreshes it first when the access token has expired.
setAccessTokenProvider(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null);

interface AuthContextValue {
  ready: boolean;
  signedIn: boolean;
  /** The verb of the open sign-in sheet, or null when it is closed. */
  sheet: SignInVerb | null;
  pushStatus: PushStatus | null;
  requireSignIn: (verb: SignInVerb, action?: () => unknown) => void;
  /** Called by the sign-in sheet with the session signInWithPassword or signUp returned. */
  completeSignIn: (session: Session) => Promise<void>;
  closeSheet: () => void;
  /** Removes the push token from the API, then ends the Supabase session. */
  signOut: () => Promise<void>;
  /** Drops the session on this device only (after account deletion or a 401). */
  forgetSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SignInVerb | null>(null);
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const pending = useRef<(() => unknown) | null>(null);

  const clearAccountState = useCallback(() => {
    setToken(null);
    setPushStatus(null);
    queryClient.removeQueries({ queryKey: ['me'] });
  }, [queryClient]);

  // Session state follows Supabase: INITIAL_SESSION on start, SIGNED_IN, TOKEN_REFRESHED, SIGNED_OUT (also when
  // a refresh token is rejected). The callback only sets state; calling supabase.auth from inside it can deadlock.
  useEffect(() => {
    void SecureStore.deleteItemAsync(LEGACY_TOKEN_KEY).catch(() => undefined);
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) setToken(session.access_token);
      else clearAccountState();
      if (event === 'INITIAL_SESSION') setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, [clearAccountState]);

  // Refresh tokens only while the app is in the foreground (supabase-js React Native guidance).
  useEffect(() => {
    const follow = (state: string | null | undefined) => {
      if (state === 'active') void supabase.auth.startAutoRefresh();
      else void supabase.auth.stopAutoRefresh();
    };
    follow(AppState.currentState);
    const subscription = AppState.addEventListener('change', follow);
    return () => {
      subscription.remove();
      void supabase.auth.stopAutoRefresh();
    };
  }, []);

  const forgetSession = useCallback(async () => {
    clearAccountState();
    await forgetPushToken();
    // Local scope: no server call needed, so this works offline and after the account (and its Supabase user) is gone.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }, [clearAccountState]);

  useEffect(() => {
    setUnauthorizedHandler(() => void forgetSession());
    return () => setUnauthorizedHandler(null);
  }, [forgetSession]);

  const requireSignIn = useCallback(
    (verb: SignInVerb, action?: () => unknown) => {
      if (token) {
        action?.();
        return;
      }
      pending.current = action ?? null;
      setSheet(verb);
    },
    [token],
  );

  const completeSignIn = useCallback(async (session: Session) => {
    setToken(session.access_token);
    setSheet(null);
    const action = pending.current;
    pending.current = null;
    action?.();
    // The account takes the app's language for emails and notifications (US-35); GET/PATCH /me create it if new.
    void updateMe({ locale: currentLocale() }).catch(() => undefined);
    // Ask for notification permission only now, after the citizen chose to act (US-29).
    void registerForPush().then(setPushStatus);
  }, []);

  const closeSheet = useCallback(() => {
    pending.current = null;
    setSheet(null);
  }, []);

  const signOut = useCallback(async () => {
    // The push token must go while the access token is still valid.
    await unregisterPush();
    const { error } = await supabase.auth.signOut().catch((e: unknown) => ({ error: e }));
    // Offline, the global sign-out fails and keeps the session; sign this device out regardless.
    if (error) await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    clearAccountState();
  }, [clearAccountState]);

  const value = useMemo(
    () => ({ ready, signedIn: token !== null, sheet, pushStatus, requireSignIn, completeSignIn, closeSheet, signOut, forgetSession }),
    [ready, token, sheet, pushStatus, requireSignIn, completeSignIn, closeSheet, signOut, forgetSession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth needs <AuthProvider>');
  return ctx;
}
