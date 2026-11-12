import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HotspotsPage } from '@/console/pages/HotspotsPage';
import { RequireStaff } from '@/console/StaffProvider';
import { MESSAGES } from '@/i18n';

export const metadata: Metadata = { title: MESSAGES.de['console.nav.hotspots'] };

// Hotspots (US-50, US-52): map and table of clusters for the tenant in the URL.
export default function ConsoleHotspotsPage() {
  return (
    <RequireStaff>
      <Suspense>
        <HotspotsPage />
      </Suspense>
    </RequireStaff>
  );
}
