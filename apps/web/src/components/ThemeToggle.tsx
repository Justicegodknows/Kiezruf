'use client';

// Light/dark switch (design system from main's `design` branch). Without a saved choice the OS setting applies
// through CSS (`prefers-color-scheme`); a click saves the choice in localStorage and sets `data-theme` on <html>.
import { useLayoutEffect, useSyncExternalStore } from 'react';
import { useI18n } from '@/i18n/I18nProvider';

export const THEME_STORAGE_KEY = 'kiezruf-theme';
type Theme = 'light' | 'dark';

// Runs in <head> before first paint (InlineScript), so a saved theme never flashes.
export const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

function readTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return media().matches ? 'dark' : 'light';
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const mq = media();
  mq.addEventListener('change', onChange);
  return () => {
    observer.disconnect();
    mq.removeEventListener('change', onChange);
  };
}

export function ThemeToggle() {
  const { t } = useI18n();
  // The server snapshot is "light"; React swaps in the real value right after hydration.
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'light' as Theme);

  // React's dev Strict Mode remount resets <html> attributes; re-apply the saved choice before paint.
  useLayoutEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
    } catch {}
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {}
  }

  const label = theme === 'dark' ? t('nav.themeLight') : t('nav.themeDark');
  return (
    <button type="button" className="icon-button" onClick={toggle} aria-label={label} title={label}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {theme === 'dark' ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
    </button>
  );
}
