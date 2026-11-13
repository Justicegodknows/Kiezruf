import Link from 'next/link';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/get-dictionary';
import { Icon } from './Icon';
import { LanguageSwitch } from './LanguageSwitch';
import { NavLinks } from './NavLinks';
import { ThemeToggle } from './ThemeToggle';

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="32" height="32">
        <rect width="32" height="32" rx="9" fill="var(--brand)" />
        <path d="M16 25s-6.5-5.4-6.5-10.6a6.5 6.5 0 0 1 13 0C22.5 19.6 16 25 16 25z" fill="var(--on-brand)" />
        <circle cx="16" cy="14.3" r="2.6" fill="var(--signal)" />
      </svg>
    </span>
  );
}

export function SiteHeader({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link href={`/${locale}`} className="brand">
          <BrandMark />
          <span className="brand__text">
            <span className="brand__name">Kiezruf</span>
            <span className="brand__tagline">{dict.common.brandTagline}</span>
          </span>
        </Link>
        <NavLinks
          label={dict.nav.label}
          items={[
            { href: `/${locale}`, text: dict.nav.reports, icon: 'pin' },
            { href: `/${locale}/console`, text: dict.nav.console, icon: 'building' },
          ]}
        />
        <div className="site-header__tools">
          <LanguageSwitch current={locale} label={dict.language.label} names={dict.language} />
          <ThemeToggle toLight={dict.theme.toLight} toDark={dict.theme.toDark} />
          <button type="button" className="button button--ghost button--sm site-header__signin">
            <Icon name="user" size={18} />
            <span>{dict.nav.signIn}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ dict }: { dict: Dictionary }) {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="site-footer__brand">
          <BrandMark />
          <p>
            <strong>Kiezruf</strong> · {dict.footer.tagline}
          </p>
        </div>
        <ul className="site-footer__links">
          <li>
            <a href="#">{dict.footer.privacy}</a>
          </li>
          <li>
            <a href="#">{dict.footer.accessibility}</a>
          </li>
          <li>
            <a href="#">{dict.footer.imprint}</a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
