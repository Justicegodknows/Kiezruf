'use client';

// Small shared pieces of the citizen frontend (app prototype): icons, the account button and the top bar.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { initialsOf } from '@/lib/petition';

const PATHS = {
  pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  chevron: 'M6 9l6 6 6-6',
  back: 'M19 12H5M11 18l-6-6 6-6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  camera: 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z M12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  flame: 'M12 2c1 3.5 5 5.5 5 10.5A5 5 0 0 1 7 12.5c0-2 .8-3.4 2-4.5 0 2 1 3 2 3 0-3.5-.6-5.6 1-9z',
  target: 'M12 18.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z M12 2.5v2.5M12 19v2.5M2.5 12h2.5M19 12h2.5',
  navigate: 'M3 11l18-8-8 18-2-8z',
  grid: 'M4 4h6.5v6.5H4z M13.5 4H20v6.5h-6.5z M4 13.5h6.5V20H4z M13.5 13.5H20V20h-6.5z',
  list: 'M4 6h16M4 12h16M4 18h16',
  image: 'M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M15.5 9.5a1.5 1.5 0 1 0 0-.01',
} as const;

export type IconName = keyof typeof PATHS;

export function KzIcon({ name, size = 20, stroke = 2.2, fill = false }: { name: IconName; size?: number; stroke?: number; fill?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** A topic's icon from the prototype (petition.ts holds the paths). */
export function PathIcon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}

/** Right side of every top bar: the round initials button to the account, or "Sign in" for guests. */
export function AccountButton() {
  const { t } = useI18n();
  const { session, signedIn, loading, requireSignIn } = useAuth();
  if (loading) return <span className="kz-avatar" aria-hidden="true" />;
  if (!signedIn) {
    return (
      <button type="button" className="kz-pill" onClick={() => void requireSignIn()}>
        {t('kz.signIn')}
      </button>
    );
  }
  return (
    <Link href="/account" className="kz-avatar" aria-label={t('kz.navAccount')}>
      {initialsOf(session?.email) ?? 'Me'}
    </Link>
  );
}

/** Top bar of the screens with a back button (account, new petition, lists). */
export function KzTopBar({ title, backHref = '/', backLabel, right }: { title: string; backHref?: string; backLabel?: string; right?: ReactNode }) {
  const { t } = useI18n();
  return (
    <header className="kz-bar">
      <div className="kz-bar__left">
        <Link href={backHref} className="kz-round" aria-label={backLabel ?? t('kz.backToPetitions')}>
          <KzIcon name="back" size={18} stroke={2.4} />
        </Link>
        <h1 className="kz-bar__title">{title}</h1>
      </div>
      {right ?? <AccountButton />}
    </header>
  );
}
