import type { Metadata } from 'next';
import { OwnReportList } from '@/components/OwnReportList';
import { PageHeading } from '@/components/PageHeading';
import { MESSAGES } from '@/i18n';

export const metadata: Metadata = { title: MESSAGES.de['following.title'] };

export default function FollowingPage() {
  return (
    <div className="page narrow">
      <PageHeading title="following.title" intro="following.intro" />
      <OwnReportList kind="follows" />
    </div>
  );
}
