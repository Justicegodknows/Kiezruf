'use client';

// The chosen language lives in the browser (localStorage) and, for signed-in citizens, also on the account
// (PATCH /me, done by the Account page). The server always renders German; the browser switches after hydration.
import { createContext, use, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { DEFAULT_LOCALE, isLocale, plural, translator, type Locale, type MessageKey, type Translate, type Vars } from '.';

const STORAGE_KEY = 'kiezruf.locale';
const listeners = new Set<() => void>();

function readLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function setStoredLocale(locale: Locale) {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
  listeners.forEach((listener) => listener());
}

interface I18n {
  locale: Locale;
  t: Translate;
  tp: (base: string, count: number, vars?: Vars) => string;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children, locale: fixed }: { children: ReactNode; locale?: Locale }) {
  const stored = useSyncExternalStore(subscribe, readLocale, () => DEFAULT_LOCALE);
  const locale = fixed ?? stored;

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18n>(
    () => ({
      locale,
      t: translator(locale),
      tp: (base, count, vars) => plural(locale, base, count, vars),
      setLocale: setStoredLocale,
    }),
    [locale],
  );
  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18n {
  const value = use(I18nContext);
  if (!value) throw new Error('useI18n needs an I18nProvider');
  return value;
}

export function useT(): (key: MessageKey, vars?: Vars) => string {
  return useI18n().t;
}
