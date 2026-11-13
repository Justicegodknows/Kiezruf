import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import de, { type Strings } from './de';
import en from './en';

export type Lang = 'de' | 'en';
export const langs: Lang[] = ['de', 'en'];

/** Device language if we support it; Berlin district offices work in German, so German otherwise. */
export function deviceLang(): Lang {
  const code = getLocales()[0]?.languageCode;
  return code === 'en' ? 'en' : 'de';
}

// Typed keys: t('home.title') is checked against the German dictionary.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: Strings };
  }
}

// Our own instance rather than the global default, so tests and the app share one configured object.
const i18n = createInstance();
i18n.use(initReactI18next).init({
  resources: { de: { translation: de }, en: { translation: en } },
  lng: deviceLang(),
  fallbackLng: 'de',
  interpolation: { escapeValue: false }, // React Native renders text, not HTML.
  returnNull: false,
});

export default i18n;
