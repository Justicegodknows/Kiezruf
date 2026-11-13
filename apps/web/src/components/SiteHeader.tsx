'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { useChangeLocale } from '@/auth/useChangeLocale';
import { useI18n } from '@/i18n/I18nProvider';
import { LOCALES, type MessageKey } from '@/i18n';
import { ThemeToggle } from '@/components/ThemeToggle';

const LINKS: { href: string; label: MessageKey }[] = [
  { href: '/', label: 'nav.browse' },
  { href: '/new-report', label: 'nav.report' },
  { href: '/my-reports', label: 'nav.myReports' },
  { href: '/following', label: 'nav.following' },
  { href: '/account', label: 'nav.account' },
];

export function SiteHeader() {
  const { t, locale } = useI18n();
  const changeLocale = useChangeLocale();
  const { signedIn, loading, requireSignIn } = useAuth();

  return (
    <header className="site-header">
      <Link href="/" className="brand">
        <span className="brand-mark" aria-hidden="true" />
        Kiezruf
      </Link>
      <Suspense fallback={<NavLinks pathname={null} />}>
        <CurrentNavLinks />
      </Suspense>
      <div className="header-tools">
        <ThemeToggle />
        <div role="group" aria-label={t('nav.language')} className="lang-switch">
          {LOCALES.map((l) => (
            <button key={l} type="button" lang={l} aria-pressed={locale === l} onClick={() => void changeLocale(l)} className="btn ghost sm">
              {t(`language.${l}` as MessageKey)}
            </button>
          ))}
        </div>
        {!loading && !signedIn ? (
          <button type="button" className="btn sm" onClick={() => void requireSignIn()}>
            {t('nav.signIn')}
          </button>
        ) : null}
        {signedIn ? <span className="muted small">{t('nav.signedIn')}</span> : null}
      </div>
    </header>
  );
}

// The current path is request data on dynamic routes, so it streams in behind Suspense (Cache Components).
function CurrentNavLinks() {
  return <NavLinks pathname={usePathname()} />;
}

function NavLinks({ pathname }: { pathname: string | null }) {
  const { t } = useI18n();
  const current = (href: string) =>
    pathname !== null && (href === '/' ? pathname === '/' || pathname.startsWith('/berlin/') : pathname.startsWith(href));
  return (
    <nav aria-label={t('nav.label')}>
      <ul className="nav-list">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href} aria-current={current(link.href) ? 'page' : undefined} className={link.href === '/new-report' ? 'btn primary sm' : 'nav-link'}>
              {t(link.label)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
