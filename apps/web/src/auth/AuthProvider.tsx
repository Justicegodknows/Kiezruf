'use client';

// "Browse freely, sign in only to act" (US-01). Any action that needs an account calls `runAuthed`: a guest gets
// the sign-in dialog, and once signed in the action runs on its own. If the session turns out to be gone
// (401), the dialog opens again and the action is retried once.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, type ApiResult, type SessionInfo } from '@/lib/api-client';
import { SignInDialog } from './SignInDialog';

export const SESSION_QUERY_KEY = ['session'] as const;

interface Auth {
  session: SessionInfo | undefined;
  signedIn: boolean;
  loading: boolean;
  /** Resolves true once the citizen is signed in, false if they close the dialog. */
  requireSignIn: () => Promise<boolean>;
  /** Signs in if needed, then runs the action. Returns null if the citizen did not sign in. */
  runAuthed: <T>(action: () => Promise<ApiResult<T>>) => Promise<ApiResult<T> | null>;
  signOut: () => Promise<void>;
  /** After the account was deleted or the session ended elsewhere. */
  markSignedOut: () => void;
}

const AuthContext = createContext<Auth | null>(null);

async function fetchSession(): Promise<SessionInfo> {
  const result = await api<SessionInfo>('session');
  if (!result.ok) throw new Error(String(result.error));
  return result.data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: fetchSession, staleTime: 60_000 });
  const session = sessionQuery.data;
  const [dialogOpen, setDialogOpen] = useState(false);
  const waiting = useRef<((signedIn: boolean) => void)[]>([]);

  const settle = useCallback((signedIn: boolean) => {
    const resolvers = waiting.current;
    waiting.current = [];
    setDialogOpen(false);
    resolvers.forEach((resolve) => resolve(signedIn));
  }, []);

  const requireSignIn = useCallback(async () => {
    const current = queryClient.getQueryData<SessionInfo>(SESSION_QUERY_KEY) ?? (await queryClient.fetchQuery({ queryKey: SESSION_QUERY_KEY, queryFn: fetchSession }).catch(() => undefined));
    if (current?.signedIn) return true;
    return new Promise<boolean>((resolve) => {
      waiting.current.push(resolve);
      setDialogOpen(true);
    });
  }, [queryClient]);

  const markSignedOut = useCallback(() => {
    queryClient.setQueryData<SessionInfo>(SESSION_QUERY_KEY, { signedIn: false });
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] === 'me' });
  }, [queryClient]);

  const runAuthed = useCallback(
    async <T,>(action: () => Promise<ApiResult<T>>): Promise<ApiResult<T> | null> => {
      if (!(await requireSignIn())) return null;
      const first = await action();
      if (first.ok || first.status !== 401) return first;
      markSignedOut();
      if (!(await requireSignIn())) return null;
      return action();
    },
    [requireSignIn, markSignedOut],
  );

  const signOut = useCallback(async () => {
    await api('auth/logout', { method: 'POST' });
    markSignedOut();
  }, [markSignedOut]);

  const onSignedIn = useCallback(async () => {
    await queryClient.fetchQuery({ queryKey: SESSION_QUERY_KEY, queryFn: fetchSession }).catch(() => undefined);
    await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'me' });
    settle(true);
  }, [queryClient, settle]);

  const value = useMemo<Auth>(
    () => ({
      session,
      signedIn: session?.signedIn === true,
      loading: sessionQuery.isPending,
      requireSignIn,
      runAuthed,
      signOut,
      markSignedOut,
    }),
    [session, sessionQuery.isPending, requireSignIn, runAuthed, signOut, markSignedOut],
  );

  return (
    <AuthContext value={value}>
      {children}
      <SignInDialog open={dialogOpen} onCancel={() => settle(false)} onSignedIn={onSignedIn} />
    </AuthContext>
  );
}

export function useAuth(): Auth {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth needs an AuthProvider');
  return value;
}
