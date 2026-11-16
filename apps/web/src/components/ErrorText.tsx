'use client';

import { useT } from '@/i18n/I18nProvider';
import { errorMessageKey } from '@/lib/errors';

/** A translated error message for an API or client error code, announced to screen readers. */
export function ErrorText({ code, id }: { code: string | null | undefined; id?: string }) {
  const t = useT();
  if (!code) return null;
  return (
    <p id={id} role="alert" className="error">
      <span aria-hidden="true">⚠ </span>
      {t(errorMessageKey(code))}
    </p>
  );
}
