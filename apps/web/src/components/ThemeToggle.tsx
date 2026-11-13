'use client';

import { useLayoutEffect, useSyncExternalStore } from 'react';
import { Icon } from './Icon';

export const THEME_STORAGE_KEY = 'kiezruf-theme';
type Theme = 'light' | 'dark';

// Runs in <head> before first paint, so a saved theme never flashes (see the Next.js
// "Preventing flash before hydration" guide). Without a saved choice the OS setting applies via CSS.
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

export function ThemeToggle({ toLight, toDark }: { toLight: string; toDark: string }) {
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

  const label = theme === 'dark' ? toLight : toDark;
  return (
    <button type="button" className="icon-button" onClick={toggle} aria-label={label} title={label}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
    </button>
  );
}
