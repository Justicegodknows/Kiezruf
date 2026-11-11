import { Suspense } from 'react';
import { ReportDetailFromParams } from '@/components/ReportDetailFromParams';

// /berlin/<bezirk>/<report id>: the URL mirrors the tenant tree (web prototype).
export default function ReportPage() {
  return (
    <Suspense>
      <ReportDetailFromParams />
    </Suspense>
  );
}
