'use client';

import Link from 'next/link';
import { useT } from '@/i18n/I18nProvider';

export default function NotFound() {
  const t = useT();
  return (
    <div className="page narrow">
      <h1>{t('notFound.title')}</h1>
      <p>{t('notFound.body')}</p>
      <p>
        <Link href="/" className="btn primary">
          {t('nav.browse')}
        </Link>
      </p>
    </div>
  );
}
