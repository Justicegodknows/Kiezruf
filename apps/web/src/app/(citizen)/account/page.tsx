import type { Metadata } from 'next';
import { AccountSettings } from '@/components/AccountSettings';
import { PageHeading } from '@/components/PageHeading';
import { MESSAGES } from '@/i18n';

export const metadata: Metadata = { title: MESSAGES.de['account.title'] };

export default function AccountPage() {
  return (
    <div className="page narrow">
      <PageHeading title="account.title" />
      <AccountSettings />
    </div>
  );
}
