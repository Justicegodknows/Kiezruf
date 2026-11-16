import type { Metadata } from 'next';
import { NewReportForm } from '@/components/NewReportForm';
import { PageHeading } from '@/components/PageHeading';
import { MESSAGES } from '@/i18n';

export const metadata: Metadata = { title: MESSAGES.de['compose.title'] };

export default function NewReportPage() {
  return (
    <div className="page narrow">
      <PageHeading title="compose.title" intro="compose.intro" />
      <NewReportForm />
    </div>
  );
}
