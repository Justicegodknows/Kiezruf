'use client';

// Report detail (US-18, US-19, US-20): photos, category, status, description, receiving office, Me too,
// follow and comments. Public data needs no account; the signed-in relation comes from GET /reports/:id/me.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { formatDateTime } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { apiOrThrow, type PublicReport, type Relation, type ReportDetail } from '@/lib/api-client';
import { reportPath } from '@/lib/paths';
import { Comments } from './Comments';
import { ErrorText } from './ErrorText';
import { FollowButton } from './FollowButton';
import { categoryLabel, groupLabel, statusLabel } from './labels';
import { MeTooButton } from './MeTooButton';
import { StatusBadge } from './StatusBadge';

export function ReportDetailView({ publicId }: { publicId: string }) {
  const { t, locale } = useI18n();
  const { signedIn } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const reportKey = ['report', publicId];
  const relationKey = ['me', 'relation', publicId];
  const report = useQuery({ queryKey: reportKey, queryFn: () => apiOrThrow<ReportDetail>(`public/reports/${publicId}`) });
  const relation = useQuery({
    queryKey: relationKey,
    queryFn: () => apiOrThrow<Relation>(`reports/${publicId}/me`),
    enabled: signedIn,
  });

  // The URL mirrors the tenant tree; fix the Bezirk part if a link had it wrong.
  const canonical = report.data ? reportPath(report.data) : null;
  useEffect(() => {
    if (canonical && pathname && pathname !== canonical) router.replace(canonical, { scroll: false });
  }, [canonical, pathname, router]);

  if (report.isPending) return <p role="status">{t('common.loading')}</p>;
  if (report.isError) {
    const code = (report.error as { code?: string }).code ?? 'unknown';
    return (
      <div className="detail">
        <h2>{code === 'not_found' ? t('detail.notFound') : t('detail.title')}</h2>
        {code === 'not_found' ? <p>{t('detail.notFoundBody')}</p> : <ErrorText code={code} />}
      </div>
    );
  }

  const r = report.data;
  const rel = relation.data;

  function updateCount(meTooCount: number) {
    queryClient.setQueryData<ReportDetail>(reportKey, (old) => (old ? { ...old, meTooCount } : old));
    queryClient.setQueriesData<{ reports: PublicReport[] }>({ queryKey: ['public-reports'] }, (old) =>
      old ? { reports: old.reports.map((x) => (x.publicId === publicId ? { ...x, meTooCount } : x)) } : old,
    );
  }

  function setRelation(patch: Partial<Relation>) {
    queryClient.setQueryData<Relation>(relationKey, (old) => ({ following: false, meToo: false, mine: false, ...old, ...patch }));
  }

  return (
    <article className="detail" aria-labelledby="detail-title">
      <nav aria-label={t('detail.breadcrumb')} className="crumb small">
        <ol>
          <li>Berlin</li>
          <li aria-current="page">{r.tenantName}</li>
        </ol>
      </nav>
      {r.photos.length > 0 ? (
        <ul className="photos">
          {r.photos.map((p, i) => (
            <li key={p.url}>
              {/* Photos come from the public bucket with faces and plates blurred; next/image would proxy them. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={t('detail.photoAlt', { n: i + 1, total: r.photos.length, category: categoryLabel(t, r.category) })} loading="lazy" />
            </li>
          ))}
        </ul>
      ) : null}
      <p className="small muted">
        {groupLabel(t, r.category)} · {r.publicId}
      </p>
      <h2 id="detail-title">{categoryLabel(t, r.category)}</h2>
      <div className="card-row">
        <StatusBadge status={r.status} label={statusLabel(t, r.status)} />
        {r.dangerous ? <span className="tag danger">{t('report.dangerous')}</span> : null}
      </div>
      {r.description ? <p>{r.description}</p> : null}
      <dl className="facts small">
        <dt>{t('detail.office')}</dt>
        <dd>{r.office ? `${r.office} (${r.tenantName})` : r.tenantName}</dd>
        <dt>{t('detail.reported')}</dt>
        <dd>{formatDateTime(locale, r.createdAt)}</dd>
        {r.updatedAt !== r.createdAt ? (
          <>
            <dt>{t('detail.updated')}</dt>
            <dd>{formatDateTime(locale, r.updatedAt)}</dd>
          </>
        ) : null}
      </dl>
      {rel?.mine ? <p className="small">{t('detail.mine')}</p> : null}
      <div className="actions">
        <MeTooButton
          publicId={publicId}
          count={r.meTooCount}
          voted={rel?.meToo ?? false}
          onChange={(vote) => {
            updateCount(vote.meTooCount);
            setRelation({ meToo: vote.voted });
            // Voting follows the report automatically (US-20); reload the relation to show it.
            void queryClient.invalidateQueries({ queryKey: relationKey });
          }}
        />
        <FollowButton
          publicId={publicId}
          following={rel?.following ?? false}
          onChange={(following) => setRelation({ following })}
        />
      </div>
      <Comments publicId={publicId} />
    </article>
  );
}
