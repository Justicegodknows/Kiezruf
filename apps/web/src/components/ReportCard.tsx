'use client';

// One report in the list (US-15). Shows category, status, distance, age, office and the Me too count.
// Never a score or level: the public API does not send them and this card has no place for them (US-24).
import Link from 'next/link';
import { useI18n } from '@/i18n/I18nProvider';
import { formatDateTime, formatDistance } from '@/i18n';
import type { PublicReport } from '@/lib/api-client';
import { reportPath } from '@/lib/paths';
import { categoryLabel, groupLabel, statusLabel } from './labels';
import { StatusBadge } from './StatusBadge';

export function ReportCard({ report, selected }: { report: PublicReport; selected?: boolean }) {
  const { t, tp, locale } = useI18n();
  return (
    <article className={`card${selected ? ' selected' : ''}`} aria-current={selected ? 'true' : undefined}>
      <h3 className="card-title">
        <Link href={reportPath(report)} className="card-link">
          {categoryLabel(t, report.category)}
          {report.distanceM !== undefined ? (
            <span className="visually-hidden">, {t('report.distance', { distance: formatDistance(locale, report.distanceM) })}</span>
          ) : null}
        </Link>
      </h3>
      <p className="small muted">
        {groupLabel(t, report.category)} · {report.publicId}
      </p>
      <div className="card-row">
        <StatusBadge status={report.status} label={statusLabel(t, report.status)} />
        {report.dangerous ? <span className="tag danger">{t('report.dangerous')}</span> : null}
      </div>
      {report.description ? <p className="card-desc">{report.description}</p> : null}
      <p className="small">
        <span>{tp('meToo.count', report.meTooCount)}</span>
        {report.distanceM !== undefined ? <span aria-hidden="true"> · {formatDistance(locale, report.distanceM)}</span> : null}
        <span> · {formatDateTime(locale, report.createdAt)}</span>
      </p>
      <p className="small muted">{report.office ? `${report.office} (${report.tenantName})` : report.tenantName}</p>
    </article>
  );
}
