import { Suspense } from 'react';
import { ForwardedFromParams } from '@/console/pages/ForwardedReport';

// The report behind a forward link, read-only and without login (US-45).
export default function ForwardedPage() {
  return (
    <Suspense>
      <ForwardedFromParams />
    </Suspense>
  );
}
