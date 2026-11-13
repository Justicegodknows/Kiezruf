import { intlLocale, type Locale } from './config';

/** Replaces `{name}` placeholders in a dictionary string. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/** "vor 2 Stunden" / "2 hours ago", from a fixed age so server and client agree. */
export function formatAge(ageHours: number, locale: Locale): string {
  const rtf = new Intl.RelativeTimeFormat(intlLocale[locale], { numeric: 'auto', style: 'short' });
  if (ageHours < 1) return rtf.format(-Math.max(1, Math.round(ageHours * 60)), 'minute');
  if (ageHours < 24) return rtf.format(-Math.round(ageHours), 'hour');
  return rtf.format(-Math.round(ageHours / 24), 'day');
}

export function formatNumber(value: number, locale: Locale, digits = 0): string {
  return new Intl.NumberFormat(intlLocale[locale], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatDistance(metres: number, locale: Locale): string {
  return metres < 1000 ? `${formatNumber(metres, locale)} m` : `${formatNumber(metres / 1000, locale, 1)} km`;
}
