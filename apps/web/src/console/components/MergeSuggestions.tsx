'use client';

// Merge suggestions (US-17): reports of the same tenant within 150 m and the same category group, most similar
// photo first. "Merge into this report" merges the suggested duplicate into the report on screen, with the same
// confirmation and endpoint as the merge form (POST /staff/reports/:duplicate/merge { into }). Only for staff who
// may change the report.
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { ErrorText } from '@/components/ErrorText';
import { statusLabel } from '@/components/labels';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime, formatDistance, formatNumber } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { apiOrThrow, type ApiResult } from '@/lib/api-client';
import { consoleReportPath } from '@/lib/console-paths';
import { normalizeMergeSuggestions, type MergeSuggestion } from '../analysis';
import { LevelChip } from './LevelChip';

export function MergeSuggestions({
  publicId,
  editable,
  merge,
}: {
  publicId: string;
  editable: boolean;
  /** Merges `duplicate` into this report. */
  merge: (duplicate: string) => Promise<ApiResult<unknown>>;
}) {
  const { t, locale } = useI18n();
  const suggestions = useQuery({
    queryKey: ['staff', 'duplicates', publicId],
    queryFn: async () => normalizeMergeSuggestions(await apiOrThrow<unknown>(`staff/reports/${publicId}/duplicates`), publicId),
    retry: false,
  });
  const [confirming, setConfirming] = useState<MergeSuggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [merged, setMerged] = useState<string | null>(null);

  async function confirm() {
    const target = confirming;
    setConfirming(null);
    if (!target) return;
    setBusy(true);
    setError(null);
    setMerged(null);
    const result = await merge(target.publicId);
    setBusy(false);
    if (!result.ok) setError(String(result.error));
    else setMerged(target.publicId);
  }

  const matches = suggestions.data ?? [];
  return (
    <section className="panel stack-sm" aria-labelledby="merge-suggestions-title">
      <h2 id="merge-suggestions-title">{t('console.suggest.title')}</h2>
      <p className="small muted">{t('console.suggest.explain')}</p>
      {suggestions.isPending ? <p role="status" className="small">{t('common.loading')}</p> : null}
      {suggestions.isError ? <ErrorText code={(suggestions.error as { code?: string }).code ?? 'unknown'} /> : null}
      {suggestions.data && matches.length === 0 ? <p className="small">{t('console.suggest.none')}</p> : null}
      {matches.length > 0 ? (
        <ul className="plain-list">
          {matches.map((m) => (
            <li key={m.publicId} className="mod-item stack-sm">
              <p>
                <Link href={consoleReportPath(m.publicId)} className="mono">
                  {m.publicId}
                </Link>
              </p>
              <div className="row small">
                {m.level ? <LevelChip level={m.level} /> : null}
                {m.status ? <StatusBadge status={m.status} label={statusLabel(t, m.status)} /> : null}
                {m.distanceM !== null ? <span>{t('report.distance', { distance: formatDistance(locale, m.distanceM) })}</span> : null}
                {m.similarity !== null ? <span>{t('console.suggest.similarity', { percent: formatNumber(locale, Math.round(m.similarity * 100)) })}</span> : null}
                {m.createdAt ? <span className="muted">{formatDateTime(locale, m.createdAt)}</span> : null}
              </div>
              {editable ? (
                <div>
                  <button type="button" className="btn sm" disabled={busy} onClick={() => setConfirming(m)}>
                    {t('console.suggest.mergeHere')}
                    <span className="visually-hidden">: {m.publicId}</span>
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {matches.length > 0 && !editable ? <p className="small muted">{t('console.suggest.readOnly')}</p> : null}
      <ErrorText code={error} />
      {merged ? (
        <p role="status" className="success small">
          {t('console.suggest.merged', { from: merged, into: publicId })}
        </p>
      ) : null}
      <Dialog open={confirming !== null} title={t('console.merge.confirmTitle')} onClose={() => setConfirming(null)}>
        <p>{confirming ? t('console.merge.confirmBody', { from: confirming.publicId, into: publicId }) : null}</p>
        <div className="row">
          <button type="button" className="btn primary" onClick={() => void confirm()}>
            {t('console.merge.confirm')}
          </button>
          <button type="button" className="btn" onClick={() => setConfirming(null)}>
            {t('common.cancel')}
          </button>
        </div>
      </Dialog>
    </section>
  );
}
