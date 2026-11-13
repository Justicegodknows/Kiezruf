'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LOCALE_COOKIE, locales, type Locale } from '@/i18n/config';

/** Swaps the locale segment of the current path: /de/console ⇄ /en/console. */
export function localizedPath(pathname: string, locale: Locale): string {
  const parts = pathname.split('/');
  parts[1] = locale;
  return parts.join('/') || `/${locale}`;
}

/** Saves the choice so the proxy sends the next unprefixed visit to the same language. */
function rememberLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}

export function LanguageSwitch({
  current,
  label,
  names,
}: {
  current: Locale;
  label: string;
  names: Record<Locale, string>;
}) {
  const pathname = usePathname() ?? `/${current}`;

  return (
    <nav className="segmented" aria-label={label}>
      {locales.map((locale) => (
        <Link
          key={locale}
          href={localizedPath(pathname, locale)}
          hrefLang={locale}
          lang={locale}
          aria-current={locale === current ? 'true' : undefined}
          title={names[locale]}
          onClick={() => rememberLocale(locale)}
          scroll={false}
        >
          {/* The accessible name starts with the visible text (WCAG 2.5.3, Label in Name). */}
          {locale.toUpperCase()}
          <span className="visually-hidden"> {names[locale]}</span>
        </Link>
      ))}
    </nav>
  );
}
