import type { Metadata, Viewport } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SkipLink } from '@/components/SkipLink';
import { MESSAGES } from '@/i18n';
import { Providers } from './providers';
import './globals.css';

// German first (US-35). The browser switches to English after hydration if the citizen chose it.
// No web fonts: system fonts only, so no request leaves for a font host.
export const metadata: Metadata = {
  title: { default: 'Kiezruf', template: '%s · Kiezruf' },
  description: MESSAGES.de['meta.description'],
  referrer: 'same-origin',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="de">
      <body>
        <Providers>
          <SkipLink />
          <SiteHeader />
          <main id="main" tabIndex={-1}>
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
