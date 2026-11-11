import { CATEGORIES } from '@kiezruf/shared';
import type { MessageKey, Translate } from '@/i18n';

export function categoryLabel(t: Translate, key: string): string {
  return CATEGORIES.some((c) => c.key === key) ? t(`category.${key}` as MessageKey) : t('category.unknown');
}

export function groupLabel(t: Translate, key: string): string {
  const group = CATEGORIES.find((c) => c.key === key)?.group;
  return group ? t(`group.${group}` as MessageKey) : '';
}

const STATUS_KEYS = new Set(['processing', 'in_moderation', 'open', 'acknowledged', 'in_progress', 'resolved', 'rejected', 'forwarded']);

export function statusLabel(t: Translate, status: string): string {
  return STATUS_KEYS.has(status) ? t(`status.${status}` as MessageKey) : t('status.unknown');
}
