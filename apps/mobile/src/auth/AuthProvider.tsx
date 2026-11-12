// Sessions (US-01, ENG-09). The token lives in expo-secure-store and goes out as Authorization: Bearer.
// requireSignIn() is the "sign in only to act" rule: it runs the action at once for a signed-in citizen, and
// otherwise opens the sign-in sheet and runs the same action on its own after the code is confirmed.
import { useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { setApiToken, setUnauthorizedHandler } from '../api/client';
import { logout } from '../api/endpoints';
import { type PushStatus, registerForPush, unregisterPush } from '../push/push';

/** 'add': "Add my photo to this report" on "Already reported?" (US-13). */
export type SignInVerb = 'post' | 'comment' | 'vote' | 'follow' | 'add' | 'continue';

const TOKEN_KEY = 'kiezruf.session';

interface AuthContextValue {
  ready: boolean;
  signedIn: boolean;
  /** The verb of the open sign-in sheet, or null when it is closed. */
  sheet: SignInVerb | null;
  pushStatus: PushStatus | null;
  requireSignIn: (verb: SignInVerb, action?: () => unknown) => void;
  completeSignIn: (token: string) => Promise<void>;
  closeSheet: () => void;
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

  const applyToken = useCallback((next: string | null) => {
    setApiToken(next);
    setToken(next);
  }, []);

  const forgetSession = useCallback(async () => {
    applyToken(null);
    setPushStatus(null);
    queryClient.removeQueries({ queryKey: ['me'] });
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
  }, [applyToken, queryClient]);

  useEffect(() => {
    let alive = true;
    SecureStore.getItemAsync(TOKEN_KEY)
      .catch(() => null)
      .then((stored) => {
        if (!alive) return;
        if (stored) applyToken(stored);
        setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [applyToken]);

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

  const completeSignIn = useCallback(
    async (newToken: string) => {
      await SecureStore.setItemAsync(TOKEN_KEY, newToken).catch(() => undefined);
      applyToken(newToken);
      setSheet(null);
      const action = pending.current;
      pending.current = null;
      action?.();
      // Ask for notification permission only now, after the citizen chose to act (US-29).
      void registerForPush().then(setPushStatus);
    },
    [applyToken],
  );

  const closeSheet = useCallback(() => {
    pending.current = null;
    setSheet(null);
  }, []);

  const signOut = useCallback(async () => {
    await unregisterPush();
    await logout().catch(() => undefined);
    await forgetSession();
  }, [forgetSession]);

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
