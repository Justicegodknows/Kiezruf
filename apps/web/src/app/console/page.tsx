import { Suspense } from 'react';
import { QueuePage } from '@/console/pages/QueuePage';
import { RequireStaff } from '@/console/StaffProvider';

// Priority queue (US-25). The filters are in the URL, so the page reads search params behind Suspense.
export default function ConsoleQueuePage() {
  return (
    <RequireStaff>
      <Suspense>
        <QueuePage />
      </Suspense>
    </RequireStaff>
  );
}
