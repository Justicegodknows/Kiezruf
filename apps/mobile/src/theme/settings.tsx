import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import i18n, { type Lang } from '@/i18n';
import { palettes, type Palette, type Scheme } from './tokens';

// Visitor preferences: language and theme. Both follow the device until the person picks one,
// and the pick is kept on the device (US-35).
type ThemePref = 'system' | Scheme;

interface Settings {
  lang: Lang;
  setLang: (lang: Lang) => void;
  scheme: Scheme;
  colors: Palette;
  toggleScheme: () => void;
}

const KEYS = { lang: 'kiezruf.lang', theme: 'kiezruf.theme' } as const;
const SettingsContext = createContext<Settings | null>(null);

function save(key: string, value: string) {
  SecureStore.setItemAsync(key, value).catch(() => {
    // Storage can be unavailable (web preview, tests). The choice still applies for this session.
  });
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [themePref, setThemePref] = useState<ThemePref>('system');
  const [lang, setLangState] = useState<Lang>(i18n.language === 'en' ? 'en' : 'de');

  // Restore saved choices once.
  useEffect(() => {
    Promise.all([SecureStore.getItemAsync(KEYS.lang), SecureStore.getItemAsync(KEYS.theme)])
      .then(([savedLang, savedTheme]) => {
        if (savedLang === 'de' || savedLang === 'en') {
          i18n.changeLanguage(savedLang);
          setLangState(savedLang);
        }
        if (savedTheme === 'light' || savedTheme === 'dark') setThemePref(savedTheme);
      })
      .catch(() => {});
  }, []);

  const scheme: Scheme = themePref === 'system' ? system : themePref;

  const setLang = useCallback((next: Lang) => {
    i18n.changeLanguage(next);
    setLangState(next);
    save(KEYS.lang, next);
  }, []);

  const toggleScheme = useCallback(() => {
    const next: Scheme = scheme === 'dark' ? 'light' : 'dark';
    setThemePref(next);
    save(KEYS.theme, next);
  }, [scheme]);

  const value = useMemo(
    () => ({ lang, setLang, scheme, colors: palettes[scheme], toggleScheme }),
    [lang, setLang, scheme, toggleScheme],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Settings {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
