'use client';

// "Not live here yet" (US-44), with "Tell me when it starts here" (POST /go-live-alerts).
import { useId, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { useT } from '@/i18n/I18nProvider';
import { api } from '@/lib/api-client';
import type { Point } from '@/lib/geo';
import { ErrorText } from './ErrorText';

export function NotLivePanel({ point, tenantName }: { point: Point; tenantName?: string | null }) {
  const t = useT();
  const { runAuthed } = useAuth();
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  async function ask() {
    setState('busy');
    setError(null);
    const result = await runAuthed(() => api('go-live-alerts', { method: 'POST', body: { lat: point.lat, lon: point.lon } }));
    if (!result) {
      setState('idle');
      return;
    }
    if (!result.ok) {
      setState('idle');
      setError(String(result.error));
      return;
    }
    setState('done');
  }

  return (
    <section className="notice info" aria-labelledby={titleId}>
      <h2 id={titleId}>{t('notLive.title')}</h2>
      <p>{tenantName ? t('notLive.bodyNamed', { tenant: tenantName }) : t('notLive.body')}</p>
      {state === 'done' ? (
        <p role="status" className="success">
          <span aria-hidden="true">✓ </span>
          {t('notLive.subscribed')}
        </p>
      ) : (
        <button type="button" className="btn primary" onClick={ask} disabled={state === 'busy'}>
          {t('notLive.notifyMe')}
        </button>
      )}
      <ErrorText code={error} />
    </section>
  );
}
