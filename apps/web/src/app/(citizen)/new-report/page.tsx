import type { Metadata } from 'next';
import { NewPetitionPage } from '@/components/kz/Pages';
import { MESSAGES } from '@/i18n';

export const metadata: Metadata = { title: MESSAGES.de['kz.newPetition'] };

export default function NewReportPage() {
  return <NewPetitionPage />;
}
