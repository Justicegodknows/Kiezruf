import type { TFunction } from 'i18next';
import { distanceLabel } from './geo';

/** "vor 2 Stunden" / "2 hours ago". */
export function ageLabel(t: TFunction, iso: string, now = new Date()): string {
  const hours = Math.floor((now.getTime() - new Date(iso).getTime()) / 3_600_000);
  if (!(hours >= 1)) return t('time.justNow');
  if (hours < 24) return t('time.hoursAgo', { count: hours });
  return t('time.daysAgo', { count: Math.floor(hours / 24) });
}

export function distanceText(t: TFunction, m: number): string {
  const { key, value } = distanceLabel(m);
  return t(key, { value });
}

export function categoryName(t: TFunction, key: string): string {
  return t(`categories.${key}`, { defaultValue: key });
}
