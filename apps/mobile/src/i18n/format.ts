import type { Lang } from './index';

const intl: Record<Lang, string> = { de: 'de-DE', en: 'en-GB' };

export function formatNumber(value: number, lang: Lang, digits = 0): string {
  return new Intl.NumberFormat(intl[lang], { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function formatDistance(metres: number, lang: Lang): string {
  return metres < 1000 ? `${formatNumber(metres, lang)} m` : `${formatNumber(metres / 1000, lang, 1)} km`;
}

// Short relative ages from a fixed age in hours. Spelled out rather than Intl.RelativeTimeFormat,
// which Hermes does not ship on every platform.
const AGE: Record<Lang, { min: string; h: string; day: string; days: string }> = {
  de: { min: 'vor {n} Min.', h: 'vor {n} Std.', day: 'gestern', days: 'vor {n} Tagen' },
  en: { min: '{n} min ago', h: '{n} hr ago', day: 'yesterday', days: '{n} days ago' },
};

export function formatAge(ageHours: number, lang: Lang): string {
  const a = AGE[lang];
  if (ageHours < 1) return a.min.replace('{n}', String(Math.max(1, Math.round(ageHours * 60))));
  if (ageHours < 24) return a.h.replace('{n}', String(Math.round(ageHours)));
  const days = Math.round(ageHours / 24);
  return days === 1 ? a.day : a.days.replace('{n}', String(days));
}
