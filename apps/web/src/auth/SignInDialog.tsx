'use client';

// Sign-in sheet (US-01): email, then the 6-digit code from the email. Same account as in the app (US-04).
import { useId, useState, type FormEvent } from 'react';
import { Dialog } from '@/components/Dialog';
import { ErrorText } from '@/components/ErrorText';
import { useI18n } from '@/i18n/I18nProvider';
import { api } from '@/lib/api-client';

export function SignInDialog({ open, onCancel, onSignedIn }: { open: boolean; onCancel: () => void; onSignedIn: () => Promise<void> }) {
  const { t } = useI18n();
  const introId = useId();
  return (
    <Dialog open={open} title={t('signin.title')} onClose={onCancel} describedBy={introId}>
      <p id={introId}>{t('signin.intro')}</p>
      <SignInForm onSignedIn={onSignedIn} />
    </Dialog>
  );
}

function SignInForm({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const { t, locale } = useI18n();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailId = useId();
  const codeId = useId();
  const errorId = useId();

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await api('auth/code', { method: 'POST', body: { email: email.trim(), locale } });
    setBusy(false);
    if (!result.ok) {
      setError(String(result.error));
      return;
    }
    setStep('code');
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await api('auth/verify', { method: 'POST', body: { email: email.trim(), code, locale } });
    if (!result.ok) {
      setBusy(false);
      setError(String(result.error));
      return;
    }
    await onSignedIn();
  }

  if (step === 'email') {
    return (
      <form onSubmit={sendCode} className="stack" noValidate={false}>
        <div className="field">
          <label htmlFor={emailId}>{t('signin.email')}</label>
          <input
            id={emailId}
            type="email"
            name="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
          />
        </div>
        <ErrorText id={errorId} code={error} />
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? t('common.sending') : t('signin.sendCode')}
        </button>
        <p className="muted small">{t('signin.privacy')}</p>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="stack">
      <p role="status">{t('signin.codeSent', { email: email.trim() })}</p>
      <div className="field">
        <label htmlFor={codeId}>{t('signin.code')}</label>
        <input
          id={codeId}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
        />
      </div>
      <ErrorText id={errorId} code={error} />
      <button type="submit" className="btn primary" disabled={busy || code.length !== 6}>
        {busy ? t('common.sending') : t('signin.verify')}
      </button>
      <button
        type="button"
        className="btn ghost"
        onClick={() => {
          setStep('email');
          setCode('');
          setError(null);
        }}
      >
        {t('signin.otherEmail')}
      </button>
    </form>
  );
}
