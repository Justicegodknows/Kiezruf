'use client';

import { useT } from '@/i18n/I18nProvider';

export function SkipLink() {
  const t = useT();
  return (
    <a className="skip-link" href="#main">
      {t('nav.skip')}
    </a>
  );
}
