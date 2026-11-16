'use client';

import { useCallback } from 'react';
import type { Locale } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { api, type ApiResult } from '@/lib/api-client';
import { useAuth } from './AuthProvider';

/** Switches the language here and, when signed in, on the account so emails follow it (US-35). */
export function useChangeLocale(): (locale: Locale) => Promise<ApiResult<unknown> | null> {
  const { setLocale } = useI18n();
  const { signedIn } = useAuth();
  return useCallback(
    async (locale: Locale) => {
      setLocale(locale);
      if (!signedIn) return null;
      return api('me', { method: 'PATCH', body: { locale } });
    },
    [setLocale, signedIn],
  );
}
