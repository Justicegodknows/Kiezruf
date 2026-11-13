import { Suspense } from 'react';
import { ConsoleReportFromParams } from '@/console/pages/ConsoleReportFromParams';
import { RequireStaff } from '@/console/StaffProvider';

// /console/reports/BE-NK-2026-0112: one report with its score breakdown and the staff actions.
export default function ConsoleReportPage() {
  return (
    <RequireStaff>
      <Suspense>
        <ConsoleReportFromParams />
      </Suspense>
    </RequireStaff>
  );
}
