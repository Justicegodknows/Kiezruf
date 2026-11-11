import type { Metadata } from 'next';
import { OwnReportList } from '@/components/OwnReportList';
import { PageHeading } from '@/components/PageHeading';
import { MESSAGES } from '@/i18n';

export const metadata: Metadata = { title: MESSAGES.de['myReports.title'] };

export default function MyReportsPage() {
  return (
    <div className="page narrow">
      <PageHeading title="myReports.title" />
      <OwnReportList kind="reports" />
    </div>
  );
}
