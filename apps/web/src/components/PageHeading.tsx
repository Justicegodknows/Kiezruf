'use client';

import type { MessageKey } from '@/i18n';
import { useT } from '@/i18n/I18nProvider';

export function PageHeading({ title, intro }: { title: MessageKey; intro?: MessageKey }) {
  const t = useT();
  return (
    <>
      <h1>{t(title)}</h1>
      {intro ? <p className="lead">{t(intro)}</p> : null}
    </>
  );
}
