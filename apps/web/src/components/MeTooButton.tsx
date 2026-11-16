'use client';

// "Me too", the like button (US-18). Voting needs a fresh browser location within the on-site radius (D-03);
// a second press takes the vote back. A guest gets the sign-in dialog and the vote follows on its own (US-01).
import { MAX_ACCURACY_M } from '@kiezruf/shared';
import { useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { api, type ApiResult } from '@/lib/api-client';
import { currentFix, LocationError } from '@/lib/geo';
import { ErrorText } from './ErrorText';

interface Vote {
  voted: boolean;
  meTooCount: number;
}

export function MeTooButton({
  publicId,
  count,
  voted,
  onChange,
}: {
  publicId: string;
  count: number;
  voted: boolean;
  onChange: (vote: Vote) => void;
}) {
  const { t, tp } = useI18n();
  const { runAuthed } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function vote(): Promise<ApiResult<Vote>> {
    let fix;
    try {
      fix = await currentFix();
    } catch (err) {
      return { ok: false, status: 0, error: err instanceof LocationError ? err.code : 'location_unavailable', body: {} };
    }
    if (fix.accuracyM > MAX_ACCURACY_M) return { ok: false, status: 0, error: 'accuracy_too_low', body: {} };
    return api<Vote>(`reports/${publicId}/me-too`, { method: 'PUT', body: { lat: fix.lat, lon: fix.lon, accuracyM: fix.accuracyM } });
  }

  async function press() {
    setBusy(true);
    setError(null);
    const result = await runAuthed(() => (voted ? api<Vote>(`reports/${publicId}/me-too`, { method: 'DELETE' }) : vote()));
    setBusy(false);
    if (!result) return;
    if (!result.ok) {
      setError(String(result.error));
      return;
    }
    onChange(result.data);
  }

  return (
    <div className="stack-sm">
      <button type="button" className={`btn ${voted ? 'dark' : 'primary'} metoo`} aria-pressed={voted} onClick={press} disabled={busy}>
        <span aria-hidden="true">{voted ? '✓ ' : '✋ '}</span>
        {busy ? t('meToo.checking') : voted ? t('meToo.voted') : t('meToo.button')}
        <span className="metoo-count"> · {tp('meToo.count', count)}</span>
      </button>
      {!voted ? <p className="small muted">{t('meToo.hint')}</p> : null}
      <ErrorText code={error} />
    </div>
  );
}
