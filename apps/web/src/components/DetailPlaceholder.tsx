'use client';

import Link from 'next/link';
import { useT } from '@/i18n/I18nProvider';

export function DetailPlaceholder() {
  const t = useT();
  return (
    <div className="detail placeholder">
      <h2>{t('detail.pickTitle')}</h2>
      <p>{t('detail.pickBody')}</p>
      <p>
        <Link href="/new-report" className="btn primary">
          {t('nav.report')}
        </Link>
      </p>
    </div>
  );
}
