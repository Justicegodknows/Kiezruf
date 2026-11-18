'use client';

// The petition pop-up (app prototype) over the feed: photos, heat badge, title and description, the signature
// progress, the office's reply (US-28), comments (US-19) and "Sign this petition" (Me too, US-18; signing follows the
// report, US-20). Public data needs no account; the signed-in relation comes from GET /reports/:id/me. Never score or
// level (US-24).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { formatDateTime, formatNumber } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { apiOrThrow, type PublicReport, type Relation, type ReportDetail } from '@/lib/api-client';
import { reportPath } from '@/lib/paths';
import { Comments } from './Comments';
import { ErrorText } from './ErrorText';
import { HeatBadge, petitionView } from './kz/PetitionCard';
import { KzIcon } from './kz/ui';
import { categoryLabel } from './labels';
import { MeTooButton } from './MeTooButton';

export function ReportDetailView({ publicId }: { publicId: string }) {
  const { t, locale } = useI18n();
  const { signedIn } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const titleId = useId();
  const replyId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [photo, setPhoto] = useState(0);
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
    if (canonical && pathname && pathname.startsWith('/berlin/') && pathname !== canonical) router.replace(canonical, { scroll: false });
  }, [canonical, pathname, router]);

  const close = () => router.push('/', { scroll: false });

  // A modal: Escape closes it, focus starts inside, and the feed behind does not scroll.
  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') router.push('/', { scroll: false });
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [router]);

  function updateCount(meTooCount: number) {
    queryClient.setQueryData<ReportDetail>(reportKey, (old) => (old ? { ...old, meTooCount } : old));
    queryClient.setQueriesData<{ reports: PublicReport[] }>({ queryKey: ['public-reports'] }, (old) =>
      old ? { reports: old.reports.map((x) => (x.publicId === publicId ? { ...x, meTooCount } : x)) } : old,
    );
  }

  function setRelation(patch: Partial<Relation>) {
    queryClient.setQueryData<Relation>(relationKey, (old) => ({ following: false, meToo: false, mine: false, ...old, ...patch }));
  }

  const r = report.data;
  const v = r ? petitionView(r, t) : null;
  const n = (x: number) => formatNumber(locale, x);

  return (
    <div className="kz-sheet">
      <button type="button" className="kz-sheet__backdrop" aria-label={t('kz.closePetition')} tabIndex={-1} onClick={close} />
      <div ref={panel} className="kz-sheet__panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        {report.isPending ? (
          <p role="status" className="kz-sheet__body" id={titleId}>
            {t('common.loading')}
          </p>
        ) : null}
        {report.isError ? (
          <div className="kz-sheet__body">
            <button type="button" className="kz-sheet__back" style={{ position: 'static', alignSelf: 'flex-start' }} onClick={close}>
              <KzIcon name="back" size={16} stroke={2.4} />
              {t('kz.back')}
            </button>
            <h2 id={titleId} className="kz-sheet__title">
              {(report.error as { code?: string }).code === 'not_found' ? t('detail.notFound') : t('detail.title')}
            </h2>
            {(report.error as { code?: string }).code === 'not_found' ? <p>{t('detail.notFoundBody')}</p> : <ErrorText code={(report.error as { code?: string }).code ?? 'unknown'} />}
          </div>
        ) : null}
        {r && v ? (
          <>
            <article className="kz-sheet__scroll" aria-labelledby={titleId}>
              <div className="kz-sheet__media">
                {r.photos.length > 0 ? (
                  <>
                    {/* Photos come from the public bucket with faces and plates blurred; next/image would proxy them. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="kz-blur" src={r.photos[photo]?.url} alt="" aria-hidden="true" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="kz-sharp"
                      src={r.photos[photo]?.url}
                      alt={t('detail.photoAlt', { n: photo + 1, total: r.photos.length, category: categoryLabel(t, r.category) })}
                    />
                  </>
                ) : (
                  <span className="kz-card__noimg">
                    <KzIcon name="image" size={44} stroke={1.6} />
                  </span>
                )}
                <button type="button" className="kz-sheet__back" onClick={close} aria-label={t('kz.backToPetitions')}>
                  <KzIcon name="back" size={16} stroke={2.4} />
                  {t('kz.back')}
                </button>
                {r.photos.length > 1 ? (
                  <span className="kz-dots">
                    {r.photos.map((p, i) => (
                      <button key={p.url} type="button" aria-current={i === photo} aria-label={t('detail.photoAlt', { n: i + 1, total: r.photos.length, category: categoryLabel(t, r.category) })} onClick={() => setPhoto(i)} />
                    ))}
                  </span>
                ) : null}
                <HeatBadge text={t(v.badge, { n: n(v.nums.left) })} level={r.status === 'open' || r.status === 'acknowledged' ? v.heat.level : 0} color={v.heat.color} />
              </div>

              <div className="kz-sheet__body">
                <div className="stack-sm">
                  <p className="kz-sheet__meta">
                    {v.topic} · {r.tenantName}
                    {r.dangerous ? ` · ${t('report.dangerous')}` : ''}
                  </p>
                  <h2 id={titleId} className="kz-sheet__title">
                    {v.title}
                  </h2>
                  {v.body ? <p className="kz-sheet__desc">{v.body}</p> : null}
                  <p className="kz-sheet__meta">{t('kz.started', { date: formatDateTime(locale, r.createdAt), id: r.publicId })}</p>
                </div>

                <div
                  className="kz-progress"
                  data-wet={v.heat.wet}
                  role="progressbar"
                  aria-label={t('kz.signaturesCollected')}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={v.nums.pct}
                  aria-valuetext={`${n(v.nums.count)} ${t('kz.of')} ${n(v.nums.goal)} ${t('kz.signatures')}`}
                >
                  <span aria-hidden="true" className="kz-fill" style={{ height: `${v.nums.pct}%`, background: `linear-gradient(0deg, ${v.heat.fillBottom} 0%, ${v.heat.fillTop} 100%)` }} />
                  <div className="kz-progress__nums">
                    <span className="kz-pct" style={{ color: v.heat.wet ? undefined : v.heat.color }}>
                      {v.nums.pct}%
                    </span>
                    <span className="kz-count">
                      <strong>{n(v.nums.count)}</strong> {t('kz.of')} {n(v.nums.goal)} {t('kz.signatures')}
                    </span>
                  </div>
                </div>

                {r.publicNote ? (
                  <section className="kz-reply" aria-labelledby={replyId}>
                    <h2 id={replyId}>{t('detail.officeNote', { office: r.office ?? r.tenantName })}</h2>
                    <p>{r.publicNote}</p>
                  </section>
                ) : null}

                {relation.data?.mine ? <p className="kz-note">{t('kz.yours')}</p> : null}
                <Comments publicId={publicId} />
              </div>
            </article>
            <div className="kz-sheet__foot">
              <MeTooButton
                publicId={publicId}
                count={r.meTooCount}
                voted={relation.data?.meToo ?? false}
                onChange={(vote) => {
                  updateCount(vote.meTooCount);
                  setRelation({ meToo: vote.voted });
                  // Signing follows the petition automatically (US-20); reload the relation to show it.
                  void queryClient.invalidateQueries({ queryKey: relationKey });
                }}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
