import { Suspense } from 'react';
import { BriefingPage } from '@/console/pages/BriefingPage';
import { RequireStaff } from '@/console/StaffProvider';

// Weekly AI briefing (US-53, US-54): the console's landing page. The tenant in view is in the URL (`tenantId`),
// so the page reads search params behind Suspense.
export default function ConsoleBriefingPage() {
  return (
    <RequireStaff>
      <Suspense>
        <BriefingPage />
      </Suspense>
    </RequireStaff>
  );
}
