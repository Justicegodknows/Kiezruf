// Locale settings shared by the proxy, the server and client components (US-35).
export const locales = ['de', 'en'] as const;
export type Locale = (typeof locales)[number];

// Berlin district offices work in German, so German is the default.
export const defaultLocale: Locale = 'de';

// Cookie that remembers the visitor's language choice. The proxy reads it on the next visit.
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export const hasLocale = (value: string): value is Locale => (locales as readonly string[]).includes(value);

// BCP 47 tags used for Intl formatting.
export const intlLocale: Record<Locale, string> = { de: 'de-DE', en: 'en-GB' };
