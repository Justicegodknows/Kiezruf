import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TrendsPage } from '@/console/pages/TrendsPage';
import { RequireStaff } from '@/console/StaffProvider';
import { MESSAGES } from '@/i18n';

export const metadata: Metadata = { title: MESSAGES.de['console.nav.trends'] };

// Trends and export (US-51, US-55) for the tenant in the URL.
export default function ConsoleTrendsPage() {
  return (
    <RequireStaff>
      <Suspense>
        <TrendsPage />
      </Suspense>
    </RequireStaff>
  );
}
