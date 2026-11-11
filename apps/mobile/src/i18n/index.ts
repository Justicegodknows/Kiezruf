// German first, English second (US-35). The device language picks English only when it is English;
// everything else starts in German. A choice in Account is stored on the device and sent to the API (PATCH /me).
import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Locale } from '../api/endpoints';
import { de } from './de';
import { en } from './en';

export const LOCALES: readonly Locale[] = ['de', 'en'];
const LOCALE_KEY = 'kiezruf.locale';

export function deviceLocale(): Locale {
  try {
    return getLocales()[0]?.languageCode === 'en' ? 'en' : 'de';
  } catch {
    return 'de';
  }
}

export function currentLocale(): Locale {
  return i18n.language === 'en' ? 'en' : 'de';
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: { de: { translation: de }, en: { translation: en } },
    lng: deviceLocale(),
    fallbackLng: 'de',
    supportedLngs: ['de', 'en'],
    interpolation: { escapeValue: false },
    initAsync: false,
    returnNull: false,
  });
}

/** Applies a stored language choice, if any. */
export async function restoreLocale() {
  try {
    const saved = await SecureStore.getItemAsync(LOCALE_KEY);
    if (saved === 'de' || saved === 'en') await i18n.changeLanguage(saved);
  } catch {
    // Storage unavailable: keep the device language.
  }
}

export async function setLocale(locale: Locale) {
  await i18n.changeLanguage(locale);
  try {
    await SecureStore.setItemAsync(LOCALE_KEY, locale);
  } catch {
    // Not fatal: the language still applies for this session.
  }
}

export default i18n;
