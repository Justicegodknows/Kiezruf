'use client';

// Priority level (US-23): the level's name as text, with colour and a shape as extra cues, never colour alone
// (WCAG 1.4.1, BITV). A manual override (US-27) gets its own marker and, where asked, its reason.
import type { Level } from '@kiezruf/shared';
import { useI18n } from '@/i18n/I18nProvider';
import { levelLabel } from '../format';
import type { Override } from '../types';

const SHAPES: Record<Level, string> = { Critical: '▲', High: '◆', Medium: '■', Low: '○' };

export function LevelChip({ level, override, showReason = false }: { level: Level; override?: Override | null; showReason?: boolean }) {
  const { t } = useI18n();
  return (
    <span className="level-wrap">
      <span className={`level level-${level.toLowerCase()}`}>
        <span aria-hidden="true">{SHAPES[level]} </span>
        {levelLabel(t, level)}
      </span>
      {override ? (
        <span className="tag override">
          {t('console.override.marker')}
          {showReason && override.reason ? <span className="override-reason">: {override.reason}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
