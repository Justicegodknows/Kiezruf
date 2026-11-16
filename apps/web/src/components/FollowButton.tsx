'use client';

// Follow a report to be told about every status change (US-20).
import { useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { useT } from '@/i18n/I18nProvider';
import { api } from '@/lib/api-client';
import { ErrorText } from './ErrorText';

export function FollowButton({ publicId, following, onChange }: { publicId: string; following: boolean; onChange: (following: boolean) => void }) {
  const t = useT();
  const { runAuthed } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function press() {
    setBusy(true);
    setError(null);
    const next = !following;
    const result = await runAuthed(() => api(`reports/${publicId}/follow`, { method: next ? 'PUT' : 'DELETE' }));
    setBusy(false);
    if (!result) return;
    if (!result.ok) {
      setError(String(result.error));
      return;
    }
    onChange(next);
  }

  return (
    <div className="stack-sm">
      <button type="button" className="btn" aria-pressed={following} onClick={press} disabled={busy}>
        <span aria-hidden="true">{following ? '★ ' : '☆ '}</span>
        {following ? t('follow.following') : t('follow.follow')}
      </button>
      <ErrorText code={error} />
    </div>
  );
}
