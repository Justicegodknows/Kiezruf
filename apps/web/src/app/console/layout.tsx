import type { Metadata } from 'next';
import { ConsoleShell } from '@/console/ConsoleShell';
import { MESSAGES } from '@/i18n';

// Municipal console (Phase 2): its own header, navigation and staff session, separate from the citizen web.
// src/proxy.ts sends requests without a staff session cookie to /console/sign-in.
export const metadata: Metadata = {
  title: { default: `Kiezruf · ${MESSAGES.de['console.brand']}`, template: `%s · Kiezruf ${MESSAGES.de['console.brand']}` },
  robots: { index: false, follow: false },
};

export default function ConsoleLayout({ children }: LayoutProps<'/console'>) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
