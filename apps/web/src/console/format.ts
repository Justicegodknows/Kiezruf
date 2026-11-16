// Number and label formatting for the console. Scores show one decimal, multipliers as many as it takes for the
// product of the shown factors to equal the shown score (US-22, features/score-breakdown.feature).
import type { Level } from '@kiezruf/shared';
import { intlLocale, type Locale, type MessageKey, type Translate } from '@/i18n';
import type { StaffRole, TenantStatus } from './types';

export function formatScore(locale: Locale, value: number): string {
  return new Intl.NumberFormat(intlLocale(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

export function formatFactor(locale: Locale, value: number, digits = 4): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: digits }).format(value);
}

/**
 * Decimals for the decay factor, so that rounding it moves the product by at most 0.001 points: a large base
 * needs more decimals than a small one, or the shown product would drift from the shown score.
 */
export function decayDigits(base: number, otherFactors: number): number {
  const weight = Math.max(1, Math.abs(base * otherFactors));
  return Math.min(10, Math.max(4, Math.ceil(Math.log10(weight * 500))));
}

/** Counts that can be fractional after a spike discount (half-weight votes). */
export function formatCount(locale: Locale, value: number): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(value);
}

/** Reads a number back the way formatScore/formatFactor wrote it (tests and the breakdown check). */
export function parseLocaleNumber(locale: Locale, text: string): number {
  const decimal = locale === 'de' ? ',' : '.';
  const group = locale === 'de' ? '.' : ',';
  return Number(text.replace(/[^\d,.-]/g, '').split(group).join('').replace(decimal, '.'));
}

export function levelLabel(t: Translate, level: Level): string {
  return t(`level.${level}` as MessageKey);
}

export function roleLabel(t: Translate, role: StaffRole): string {
  return t(`role.${role}` as MessageKey);
}

export function tenantStatusLabel(t: Translate, status: TenantStatus): string {
  return t(`tenantStatus.${status}` as MessageKey);
}

const TENANT_TYPES = new Set(['country', 'land', 'regierungsbezirk', 'kreis', 'kreisfreie_stadt', 'gemeinde', 'bezirk']);

export function tenantTypeLabel(t: Translate, type: string): string {
  return TENANT_TYPES.has(type) ? t(`tenantType.${type}` as MessageKey) : t('tenantType.other');
}

/** "5 Std." under two days, else "3 Tage". */
export function formatAge(t: Translate, locale: Locale, hours: number): string {
  if (hours < 48) return t('console.age.hours', { count: formatCount(locale, Math.max(0, Math.round(hours))) });
  return t('console.age.days', { count: formatCount(locale, Math.floor(hours / 24)) });
}

export function ageHoursSince(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  return Number.isNaN(at) ? null : (now - at) / 3_600_000;
}
