'use client';

// Export for council meetings (US-55): the queue as CSV for a date range, and the trends as CSV, for the tenant in
// view. Plain download links to the backend-for-frontend, which adds the staff session and passes the API's CSV
// through unchanged (file name and content type included).
import { useId, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { queueCsvUrl, trendsCsvUrl } from '../analysis';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function ExportPanel({ tenantId, tenantName }: { tenantId: string; tenantName: string | null }) {
  const { t } = useI18n();
  const ids = { heading: useId(), from: useId(), to: useId(), problem: useId() };
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const badRange = (from !== '' && !DATE.test(from)) || (to !== '' && !DATE.test(to)) || (from !== '' && to !== '' && from > to);

  return (
    <section className="panel stack-sm export-panel" aria-labelledby={ids.heading}>
      <h2 id={ids.heading}>{t('console.export.title')}</h2>
      <p className="small muted">{tenantName ? t('console.export.scope', { tenant: tenantName }) : t('console.export.scopeAll')}</p>
      <fieldset className="stack-sm">
        <legend>{t('console.export.queue')}</legend>
        <div className="row export-range">
          <div className="field">
            <label htmlFor={ids.from}>{t('console.export.from')}</label>
            <input id={ids.from} type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-invalid={badRange || undefined} aria-describedby={badRange ? ids.problem : undefined} />
          </div>
          <div className="field">
            <label htmlFor={ids.to}>{t('console.export.to')}</label>
            <input id={ids.to} type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-invalid={badRange || undefined} aria-describedby={badRange ? ids.problem : undefined} />
          </div>
        </div>
        {badRange ? (
          <p id={ids.problem} role="alert" className="error">
            <span aria-hidden="true">⚠ </span>
            {t('console.export.badRange')}
          </p>
        ) : null}
        <p className="small muted">{t('console.export.rangeHint')}</p>
        <div>
          {badRange ? (
            <button type="button" className="btn" disabled>
              {t('console.export.queueButton')}
            </button>
          ) : (
            <a className="btn" href={queueCsvUrl(tenantId, from, to)} download>
              {t('console.export.queueButton')}
            </a>
          )}
        </div>
      </fieldset>
      <div>
        <a className="btn" href={trendsCsvUrl(tenantId)} download>
          {t('console.export.trendsButton')}
        </a>
      </div>
    </section>
  );
}
