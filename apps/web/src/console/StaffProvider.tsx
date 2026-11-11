'use client';

// The staff session in the console. The token stays in the httpOnly staff cookie; the browser only knows who is
// signed in and their grants (GET /api/staff/session, which calls GET /staff/me). Any staff call that answers
// 401 sends the staff member back to the console sign-in, with the page they were on as `next`.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, use, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { useT } from '@/i18n/I18nProvider';
import { api, ApiError, type ApiResult } from '@/lib/api-client';
import { CONSOLE_SIGN_IN, signInUrl } from '@/lib/console-paths';
import { normalizeMe, type StaffMe, type StaffSession } from './types';

export const STAFF_SESSION_KEY = ['staff', 'session'] as const;

interface Staff {
  me: StaffMe | undefined;
  loading: boolean;
  signedIn: boolean;
  /** The session check itself failed (API unreachable): not the same as signed out. */
  error: string | null;
  signOut: () => Promise<void>;
  /** Sends the staff member to sign-in, coming back to the current page afterwards. */
  toSignIn: () => void;
  /** Runs a staff call; a 401 answer goes to sign-in. */
  call: <T>(path: string, init?: { method?: string; body?: unknown }) => Promise<ApiResult<T>>;
}

const StaffContext = createContext<Staff | null>(null);

// Read at event time rather than with usePathname, so the provider needs no Suspense boundary (Cache Components).
function onSignInPage(): boolean {
  return typeof window !== 'undefined' && window.location.pathname === CONSOLE_SIGN_IN;
}

export async function fetchStaffSession(): Promise<StaffSession> {
  const result = await api<{ signedIn?: boolean; me?: unknown }>('staff/session');
  if (!result.ok) throw new ApiError(String(result.error), result.status);
  return result.data?.signedIn ? { signedIn: true, me: normalizeMe(result.data.me) } : { signedIn: false };
}

export function StaffProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const session = useQuery({ queryKey: STAFF_SESSION_KEY, queryFn: fetchStaffSession, staleTime: 60_000 });

  const toSignIn = useCallback(() => {
    const here = typeof window === 'undefined' ? '/console' : `${window.location.pathname}${window.location.search}`;
    queryClient.setQueryData<StaffSession>(STAFF_SESSION_KEY, { signedIn: false });
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] === 'staff' && q.queryKey[1] !== 'session' });
    router.replace(signInUrl(here));
  }, [queryClient, router]);

  // Signed out (cookie gone or expired): every console page except sign-in needs a session.
  const signedOut = session.data?.signedIn === false;
  useEffect(() => {
    if (signedOut && !onSignInPage()) toSignIn();
  }, [signedOut, toSignIn]);

  // A staff query that answers 401 means the session ended: sign in again.
  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.query.queryKey[0] !== 'staff') return;
      const error = event.query.state.error;
      if (error instanceof ApiError && error.status === 401 && !onSignInPage()) toSignIn();
    });
  }, [queryClient, toSignIn]);

  const call = useCallback(
    async <T,>(path: string, init?: { method?: string; body?: unknown }) => {
      const result = await api<T>(path, init);
      if (!result.ok && result.status === 401) toSignIn();
      return result;
    },
    [toSignIn],
  );

  const signOut = useCallback(async () => {
    await api('staff/auth/logout', { method: 'POST' });
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] === 'staff' });
    queryClient.setQueryData<StaffSession>(STAFF_SESSION_KEY, { signedIn: false });
    router.replace(CONSOLE_SIGN_IN);
  }, [queryClient, router]);

  const value = useMemo<Staff>(
    () => ({
      me: session.data?.me,
      loading: session.isPending,
      signedIn: session.data?.signedIn === true,
      error: session.isError ? ((session.error as { code?: string }).code ?? 'unknown') : null,
      signOut,
      toSignIn,
      call,
    }),
    [session.data, session.isPending, session.isError, session.error, signOut, toSignIn, call],
  );
  return <StaffContext value={value}>{children}</StaffContext>;
}

export function useStaff(): Staff {
  const value = use(StaffContext);
  if (!value) throw new Error('useStaff needs a StaffProvider');
  return value;
}

/** Console pages render only for a signed-in staff member; the provider sends everyone else to sign-in. */
export function RequireStaff({ children }: { children: ReactNode }) {
  const { signedIn, loading, error } = useStaff();
  const t = useT();
  if (error) return <ErrorText code={error} />;
  if (!signedIn) return <p role="status">{loading ? t('common.loading') : t('console.signin.redirecting')}</p>;
  return <>{children}</>;
}
