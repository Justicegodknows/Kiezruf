'use client';

// Console chrome: skip link, header with the console navigation, the signed-in staff member and their roles, the
// language switch and sign-out. Separate from the citizen header; no score or level ever leaves /console (US-24).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { SkipLink } from '@/components/SkipLink';
import { LOCALES, type MessageKey } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { CONSOLE_HOME, CONSOLE_HOTSPOTS, CONSOLE_QUEUE, CONSOLE_TRENDS } from '@/lib/console-paths';
import { AccountMenu } from './components/AccountMenu';
import { roleLabel } from './format';
import { StaffProvider, useStaff } from './StaffProvider';

// The weekly briefing comes first: it is the console's landing page (US-53).
const LINKS: { href: string; label: MessageKey }[] = [
  { href: CONSOLE_HOME, label: 'console.nav.briefing' },
  { href: CONSOLE_QUEUE, label: 'console.nav.queue' },
  { href: CONSOLE_HOTSPOTS, label: 'console.nav.hotspots' },
  { href: CONSOLE_TRENDS, label: 'console.nav.trends' },
  { href: '/console/moderation', label: 'console.nav.moderation' },
  { href: '/console/tenants', label: 'console.nav.tenants' },
];

/** Which nav entry is current: the briefing only at /console itself; report pages belong to the queue. */
export function isCurrentNav(href: string, pathname: string | null): boolean {
  if (pathname === null) return false;
  if (href === CONSOLE_HOME) return pathname === CONSOLE_HOME;
  if (href === CONSOLE_QUEUE) return pathname.startsWith(CONSOLE_QUEUE) || pathname.startsWith('/console/reports');
  return pathname.startsWith(href);
}

export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <StaffProvider>
      <SkipLink />
      <ConsoleHeader />
      <main id="main" tabIndex={-1} className="console-main">
        {children}
      </main>
    </StaffProvider>
  );
}

function ConsoleHeader() {
  const { t, locale, setLocale } = useI18n();
  const { me, signedIn, signOut } = useStaff();
  return (
    <header className="site-header console-header">
      <Link href="/console" className="brand">
        <span className="brand-mark" aria-hidden="true" />
        Kiezruf <span className="brand-sub">{t('console.brand')}</span>
      </Link>
      {signedIn ? (
        <Suspense fallback={<ConsoleNav pathname={null} />}>
          <CurrentConsoleNav />
        </Suspense>
      ) : null}
      <div className="header-tools">
        {me ? (
          <span className="small muted staff-who">
            {me.email}
            {me.grants.length ? ` · ${me.grants.map((g) => `${roleLabel(t, g.role)} (${g.tenantName})`).join(', ')}` : ''}
          </span>
        ) : null}
        {signedIn ? <AccountMenu /> : null}
        <div role="group" aria-label={t('nav.language')} className="lang-switch">
          {LOCALES.map((l) => (
            <button key={l} type="button" lang={l} aria-pressed={locale === l} onClick={() => setLocale(l)} className="btn ghost sm">
              {t(`language.${l}` as MessageKey)}
            </button>
          ))}
        </div>
        {signedIn ? (
          <button type="button" className="btn sm" onClick={() => void signOut()}>
            {t('console.signOut')}
          </button>
        ) : null}
      </div>
    </header>
  );
}

// The current path is request data on dynamic routes, so it streams in behind Suspense (Cache Components).
function CurrentConsoleNav() {
  return <ConsoleNav pathname={usePathname()} />;
}

function ConsoleNav({ pathname }: { pathname: string | null }) {
  const { t } = useI18n();
  const current = (href: string) => isCurrentNav(href, pathname);
  return (
    <nav aria-label={t('console.nav.label')}>
      <ul className="nav-list">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href} aria-current={current(link.href) ? 'page' : undefined} className="nav-link">
              {t(link.label)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
