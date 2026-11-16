'use client';

import type { ReactNode } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { useT } from '@/i18n/I18nProvider';

/** Pages about the citizen's own data. Guests see why and a sign-in button. */
export function SignedInOnly({ children, why }: { children: ReactNode; why: string }) {
  const t = useT();
  const { signedIn, loading, requireSignIn } = useAuth();
  if (loading) return <p role="status">{t('common.loading')}</p>;
  if (!signedIn) {
    return (
      <div className="stack-sm">
        <p>{why}</p>
        <p>
          <button type="button" className="btn primary" onClick={() => void requireSignIn()}>
            {t('nav.signIn')}
          </button>
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
