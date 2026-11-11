'use client';

// My reports (US-11) and followed reports (US-20). Reports that are not public yet (blur still running,
// in moderation, rejected) are listed without a link, because their public page does not exist.
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { formatDateTime } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { apiOrThrow, type OwnReport } from '@/lib/api-client';
import { isPublicStatus, reportPath } from '@/lib/paths';
import { ErrorText } from './ErrorText';
import { categoryLabel, statusLabel } from './labels';
import { SignedInOnly } from './SignedInOnly';
import { StatusBadge } from './StatusBadge';

export function OwnReportList({ kind }: { kind: 'reports' | 'follows' }) {
  const { t } = useI18n();
  return (
    <SignedInOnly why={kind === 'reports' ? t('myReports.signInWhy') : t('following.signInWhy')}>
      <ReportRows kind={kind} />
    </SignedInOnly>
  );
}

function ReportRows({ kind }: { kind: 'reports' | 'follows' }) {
  const { t, tp, locale } = useI18n();
  const query = useQuery({
    queryKey: ['me', kind],
    queryFn: () => apiOrThrow<{ reports?: OwnReport[]; follows?: OwnReport[] }>(`me/${kind}`),
  });
  if (query.isPending) return <p role="status">{t('common.loading')}</p>;
  if (query.isError) return <ErrorText code={(query.error as { code?: string }).code ?? 'unknown'} />;
  const reports = query.data.reports ?? query.data.follows ?? [];
  if (reports.length === 0) {
    return (
      <div className="stack-sm">
        <p>{kind === 'reports' ? t('myReports.empty') : t('following.empty')}</p>
        <p>
          <Link href={kind === 'reports' ? '/new-report' : '/'} className="btn primary">
            {kind === 'reports' ? t('nav.report') : t('nav.browse')}
          </Link>
        </p>
      </div>
    );
  }
  return (
    <>
      <p className="small muted">{tp('myReports.count', reports.length)}</p>
      <ul className="report-list">
        {reports.map((r) => (
          <li key={r.publicId} className="card">
            <h2 className="card-title">
              {isPublicStatus(r.status) ? (
                <Link href={reportPath(r)} className="card-link">
                  {categoryLabel(t, r.category)} · {r.publicId}
                </Link>
              ) : (
                <>
                  {categoryLabel(t, r.category)} · {r.publicId}
                </>
              )}
            </h2>
            <div className="card-row">
              <StatusBadge status={r.status} label={statusLabel(t, r.status)} />
            </div>
            {!isPublicStatus(r.status) ? <p className="small">{t(r.status === 'rejected' ? 'myReports.rejectedNote' : 'myReports.notPublicYet')}</p> : null}
            {r.description ? <p className="card-desc">{r.description}</p> : null}
            <p className="small muted">
              {r.office ? `${r.office} (${r.tenantName})` : r.tenantName} · {formatDateTime(locale, r.createdAt ?? r.updatedAt ?? '')}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
