import type { Metadata } from 'next';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import { notFound } from 'next/navigation';
import { InlineScript } from '@/components/InlineScript';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { themeScript } from '@/components/ThemeToggle';
import { hasLocale, locales } from '@/i18n/config';
import { getDictionary } from '@/i18n/get-dictionary';
import '../globals.css';

// One signage family in two widths. Barlow Condensed sets headlines the way street signs set
// names: narrow, upright, readable at a glance. Barlow carries UI and body text, with tabular
// figures for IDs and scores. Low contrast and open forms keep it legible for everyone (BITV).
const display = Barlow_Condensed({ subsets: ['latin', 'latin-ext'], variable: '--font-display', weight: ['500', '600', '700'] });
const sans = Barlow({ subsets: ['latin', 'latin-ext'], variable: '--font-sans', weight: ['400', '500', '600', '700'] });

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<'/[lang]'>): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return {
    title: { default: dict.meta.title, template: `%s | Kiezruf` },
    description: dict.meta.description,
    alternates: { languages: Object.fromEntries(locales.map((l) => [l, `/${l}`])) },
  };
}

export default async function RootLayout({ children, params }: LayoutProps<'/[lang]'>) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <html
      lang={lang}
      className={`${display.variable} ${sans.variable}`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body>
        <InlineScript html={themeScript} />
        <a href="#main" className="skip-link">
          {dict.common.skipToContent}
        </a>
        <SiteHeader locale={lang} dict={dict} />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter locale={lang} dict={dict} />
      </body>
    </html>
  );
}
