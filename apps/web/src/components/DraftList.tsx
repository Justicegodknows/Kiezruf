'use client';

// Drafts kept in this browser (US-04). They cannot be posted from here; the citizen finishes them on site.
import { useEffect, useId, useState } from 'react';
import { formatDateTime, type MessageKey } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { deleteDraft, draftsAvailable, listDrafts, type Draft } from '@/lib/drafts';
import { MAX_PHOTO_AGE_HOURS } from '@kiezruf/shared';
import { categoryLabel } from './labels';

export function DraftList({ refresh }: { refresh: number }) {
  const { t, tp, locale } = useI18n();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [reload, setReload] = useState(0);
  const headingId = useId();

  useEffect(() => {
    if (!draftsAvailable()) return;
    let cancelled = false;
    listDrafts()
      .then((list) => {
        if (!cancelled) setDrafts(list);
      })
      .catch(() => {
        if (!cancelled) setDrafts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh, reload]);

  if (!drafts || drafts.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="stack-sm">
      <h2 id={headingId}>{t('drafts.title')}</h2>
      <p className="small">{t('drafts.explain')}</p>
      <ul className="report-list">
        {drafts.map((d) => (
          <li key={d.id} className="card">
            <p>
              <strong>{d.category ? categoryLabel(t, d.category) : t('drafts.noCategory')}</strong> · {formatDateTime(locale, d.createdAt)}
            </p>
            <p className="small">{tp('drafts.photos', d.photos.length)}</p>
            {d.reasons.length > 0 ? (
              <ul className="small bullets">
                {d.reasons.map((r) => (
                  <li key={r}>{t(`photo.reason.${r}` as MessageKey, { hours: MAX_PHOTO_AGE_HOURS })}</li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              className="btn ghost sm"
              onClick={async () => {
                await deleteDraft(d.id).catch(() => undefined);
                setReload((n) => n + 1);
              }}
            >
              {t('drafts.delete')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
