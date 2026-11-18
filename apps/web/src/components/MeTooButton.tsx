'use client';

// "Sign this petition" (app prototype), the report's Me too vote (US-18). Signing needs a fresh browser location within
// the on-site radius (D-03); a guest gets the sign-in dialog and the signature follows on its own (US-01). Signed, it
// shows "You signed this petition" with confetti, and a small link takes the signature back.
import { MAX_ACCURACY_M } from '@kiezruf/shared';
import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { api, type ApiResult } from '@/lib/api-client';
import { currentFix, LocationError } from '@/lib/geo';
import { ErrorText } from './ErrorText';
import { Confetti } from './kz/Confetti';
import { KzIcon } from './kz/ui';

interface Vote {
  voted: boolean;
  meTooCount: number;
}

export function MeTooButton({
  publicId,
  voted,
  onChange,
}: {
  publicId: string;
  count?: number;
  voted: boolean;
  onChange: (vote: Vote) => void;
}) {
  const { t } = useI18n();
  const { runAuthed } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    if (!celebrate) return;
    const done = window.setTimeout(() => setCelebrate(false), 3200);
    return () => window.clearTimeout(done);
  }, [celebrate]);

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

  async function press(withdraw: boolean) {
    setBusy(true);
    setError(null);
    const result = await runAuthed(() => (withdraw ? api<Vote>(`reports/${publicId}/me-too`, { method: 'DELETE' }) : vote()));
    setBusy(false);
    if (!result) return;
    if (!result.ok) {
      setError(String(result.error));
      return;
    }
    if (result.data.voted) setCelebrate(true);
    onChange(result.data);
  }

  return (
    <div className="stack-sm">
      {voted ? (
        <>
          <div role="status" className="kz-signed">
            <span className="kz-tick">
              <KzIcon name="check" size={14} stroke={2.8} />
            </span>
            {t('kz.youSigned')}
          </div>
          <button type="button" className="kz-link-button" onClick={() => void press(true)} disabled={busy}>
            {t('kz.withdraw')}
          </button>
        </>
      ) : (
        <>
          <button type="button" className="kz-cta" aria-pressed={false} onClick={() => void press(false)} disabled={busy}>
            {busy ? t('kz.checkingLocation') : t('kz.signThis')}
          </button>
          <p className="kz-hint">{t('kz.signHint')}</p>
        </>
      )}
      <ErrorText code={error} />
      {celebrate ? <Confetti /> : null}
    </div>
  );
}
