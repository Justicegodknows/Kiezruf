import type { Metadata } from 'next';
import { PetitionListPage } from '@/components/kz/Pages';
import { MESSAGES } from '@/i18n';

export const metadata: Metadata = { title: MESSAGES.de['kz.myPetitions'] };

export default function Page() {
  return <PetitionListPage kind="reports" />;
}
