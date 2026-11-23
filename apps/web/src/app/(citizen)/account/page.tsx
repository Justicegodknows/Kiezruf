import type { Metadata } from 'next';
import { AccountPage as Account } from '@/components/kz/Pages';
import { MESSAGES } from '@/i18n';

export const metadata: Metadata = { title: MESSAGES.de['kz.yourAccount'] };

export default function AccountPage() {
  return <Account />;
}
