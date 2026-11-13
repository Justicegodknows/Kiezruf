// Server-side only: imported from Server Components, so dictionaries never reach the client bundle.
import type { Locale } from './config';
import type { Dictionary } from './dictionaries/de';

const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
  de: () => import('./dictionaries/de').then((m) => m.default),
  en: () => import('./dictionaries/en').then((m) => m.default),
};

export const getDictionary = (locale: Locale) => dictionaries[locale]();

export type { Dictionary };
