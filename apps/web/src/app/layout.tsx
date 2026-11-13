import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import { InlineScript } from '@/components/InlineScript';
import { themeScript } from '@/components/ThemeToggle';
import { MESSAGES } from '@/i18n';
import { Providers } from './providers';
import './globals.css';

// German first (US-35). The browser switches to English after hydration if the citizen chose it.
// Fonts: Barlow Condensed for headlines, Barlow for UI and body (design system). next/font downloads them at build
// time and serves them from our own origin, so no request leaves for a font host.
// The citizen pages ((citizen)/layout.tsx), the staff console (console/layout.tsx) and the forward-link page
// (forwarded/layout.tsx) each bring their own header and <main>.
const display = Barlow_Condensed({ subsets: ['latin', 'latin-ext'], variable: '--font-display', weight: ['500', '600', '700'] });
const sans = Barlow({ subsets: ['latin', 'latin-ext'], variable: '--font-sans', weight: ['400', '500', '600', '700'] });

export const metadata: Metadata = {
  title: { default: 'Kiezruf', template: '%s · Kiezruf' },
  description: MESSAGES.de['meta.description'],
  referrer: 'same-origin',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // suppressHydrationWarning: the theme script may set data-theme on <html> before React hydrates.
    <html lang="de" className={`${display.variable} ${sans.variable}`} suppressHydrationWarning>
      <body>
        <InlineScript html={themeScript} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
