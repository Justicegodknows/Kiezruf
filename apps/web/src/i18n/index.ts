// Translations for the citizen web (US-35). German is the default, English the alternative.
// Every user-facing string lives in de.json / en.json; components look them up with `t(key)`.
import de from './de.json';
import enJson from './en.json';

export type MessageKey = keyof typeof de;
export type Messages = Record<MessageKey, string>;

// Typed as the German key set, so a key missing from en.json is a type error.
const en: Messages = enJson;

export const LOCALES = ['de', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'de';

export const MESSAGES: Record<Locale, Messages> = { de, en };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** BCP 47 tag for Intl formatters. */
export function intlLocale(locale: Locale): string {
  return locale === 'de' ? 'de-DE' : 'en-GB';
}

export type Vars = Record<string, string | number>;

/** Replaces `{name}` placeholders. Unknown placeholders stay as they are, so a missing variable is visible. */
export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

export type Translate = (key: MessageKey, vars?: Vars) => string;

export function translator(locale: Locale): Translate {
  const messages = MESSAGES[locale];
  return (key, vars) => interpolate(messages[key] ?? MESSAGES.de[key] ?? key, vars);
}

/** Picks `<base>.one` or `<base>.other` by the plural rules of the locale and fills in `{count}`. */
export function plural(locale: Locale, base: string, count: number, vars?: Vars): string {
  const category = new Intl.PluralRules(intlLocale(locale)).select(count) === 'one' ? 'one' : 'other';
  const key = `${base}.${category}` as MessageKey;
  return translator(locale)(key, { count: formatNumber(locale, count), ...vars });
}

export function formatNumber(locale: Locale, value: number): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

/** Date in Berlin time, e.g. "11.11.2026, 14:05". */
export function formatDateTime(locale: Locale, iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  }).format(date);
}

export function formatDistance(locale: Locale, metres: number): string {
  if (metres < 1000) return `${formatNumber(locale, Math.round(metres))} m`;
  const km = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(metres / 1000);
  return `${km} km`;
}
