'use client';

// "Already reported?" (US-13): before a report is posted, up to 3 public reports nearby in the same category group,
// most similar photo first. "Add my photo to this report" makes the citizen a co-reporter of that report instead;
// "No, mine is new" posts as planned. Public data only: no score or level (US-24).
import { useEffect, useId, useRef } from 'react';
import { formatDistance } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import type { DuplicateMatch } from '@/lib/report-assist';
import { categoryLabel, statusLabel } from './labels';
import { StatusBadge } from './StatusBadge';

export function AlreadyReported({
  matches,
  busy,
  onJoin,
  onNew,
}: {
  matches: DuplicateMatch[];
  /** The publicId being joined, or true while posting as new. */
  busy: string | boolean;
  onJoin: (match: DuplicateMatch) => void;
  onNew: () => void;
}) {
  const { t, tp, locale } = useI18n();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  // Move focus to the question once, when it appears instead of the posted confirmation.
  useEffect(() => heading.current?.focus(), []);
  return (
    <section className="step already-reported stack-sm" aria-labelledby={headingId}>
      <h2 id={headingId} tabIndex={-1} ref={heading}>
        {t('dup.title')}
      </h2>
      <p>{tp('dup.intro', matches.length)}</p>
      <ul className="plain-list dup-list">
        {matches.map((m) => (
          <li key={m.publicId} className="card dup-card">
            {m.photo ? (
              // Public, blurred photo from storage; next/image would proxy it.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.photo} alt={t('dup.photoAlt', { category: categoryLabel(t, m.category), id: m.publicId })} loading="lazy" />
            ) : null}
            <div className="stack-sm">
              <p className="card-title">{categoryLabel(t, m.category)}</p>
              <div className="row small">
                <StatusBadge status={m.status} label={statusLabel(t, m.status)} />
                {m.distanceM !== null ? <span>{t('report.distance', { distance: formatDistance(locale, m.distanceM) })}</span> : null}
                <span>{tp('meToo.count', m.meTooCount)}</span>
              </div>
              <p className="small mono muted">{m.publicId}</p>
              <div>
                <button type="button" className="btn primary" disabled={busy !== false} onClick={() => onJoin(m)}>
                  {busy === m.publicId ? t('common.sending') : t('dup.join')}
                  <span className="visually-hidden">: {m.publicId}</span>
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="small muted">{t('dup.joinExplain')}</p>
      <div>
        <button type="button" className="btn" disabled={busy !== false} onClick={onNew}>
          {busy === true ? t('review.posting') : t('dup.new')}
        </button>
      </div>
    </section>
  );
}
