import type { Level } from '@kiezruf/shared';
import type { Status } from '@/lib/sample-data';
import { Icon, type IconName } from './Icon';

const STATUS_ICON: Record<Status, IconName> = {
  open: 'inbox',
  acknowledged: 'bell',
  inProgress: 'clock',
  resolved: 'check',
};

/** Status always shows an icon and text, never colour alone (BITV 2.0). */
export function StatusBadge({ status, label }: { status: Status; label: string }) {
  return (
    <span className={`badge badge--status-${status}`}>
      <Icon name={STATUS_ICON[status]} size={14} />
      {label}
    </span>
  );
}

const LEVEL_ICON: Record<Level, IconName> = { Critical: 'alert', High: 'trendUp', Medium: 'layers', Low: 'clock' };

/** Staff-only priority level (US-23). Text plus icon, so it does not rely on colour. */
export function LevelChip({ level, label }: { level: Level; label: string }) {
  return (
    <span className={`badge badge--level-${level.toLowerCase()}`}>
      <Icon name={LEVEL_ICON[level]} size={14} />
      {label}
    </span>
  );
}
