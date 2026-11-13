import type { Metadata } from 'next';
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from 'next/font/google';
import { notFound } from 'next/navigation';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { themeScript } from '@/components/ThemeToggle';
import { hasLocale, locales } from '@/i18n/config';
import { getDictionary } from '@/i18n/get-dictionary';
import '../globals.css';

// Type pairing: Bricolage Grotesque for headings (civic, a little warm), Inter for UI and body
// text (neutral, very legible at small sizes, tabular figures), JetBrains Mono for IDs and scores.
const display = Bricolage_Grotesque({ subsets: ['latin', 'latin-ext'], variable: '--font-display', weight: ['500', '600', '700'] });
const sans = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-sans' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400', '500'] });

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<'/[lang]'>): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return {
    title: { default: dict.meta.title, template: `%s · Kiezruf` },
    description: dict.meta.description,
    alternates: { languages: Object.fromEntries(locales.map((l) => [l, `/${l}`])) },
  };
}

export default async function RootLayout({ children, params }: LayoutProps<'/[lang]'>) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <html lang={lang} className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          {dict.common.skipToContent}
        </a>
        <SiteHeader locale={lang} dict={dict} />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter dict={dict} />
      </body>
    </html>
  );
}
