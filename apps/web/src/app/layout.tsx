import type { Metadata, Viewport } from 'next';
import { MESSAGES } from '@/i18n';
import { Providers } from './providers';
import './globals.css';

// German first (US-35). The browser switches to English after hydration if the citizen chose it.
// No web fonts: system fonts only, so no request leaves for a font host.
// The citizen pages ((citizen)/layout.tsx), the staff console (console/layout.tsx) and the forward-link page
// (forwarded/layout.tsx) each bring their own header and <main>.
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
