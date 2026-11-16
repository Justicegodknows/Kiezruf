'use client';

// Sign-in sheet (US-01, ENG-24): email and password, or a new account. Same account as in the app (US-04).
// Supabase Auth (ENG-22) behind this site's /api/auth/* routes: the session lands in httpOnly cookies.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
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

type Mode = 'sign-in' | 'sign-up';

function SignInForm({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const firstMode = useRef(true);

  // Switching between signing in and creating an account keeps focus in the form (WCAG 2.4.3).
  useEffect(() => {
    if (firstMode.current) {
      firstMode.current = false;
      return;
    }
    emailRef.current?.focus();
  }, [mode]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body = mode === 'sign-up' ? { email: email.trim(), password, locale } : { email: email.trim(), password };
    const result = await api(mode === 'sign-up' ? 'auth/sign-up' : 'auth/sign-in', { method: 'POST', body });
    if (!result.ok) {
      setBusy(false);
      setError(String(result.error));
      return;
    }
    await onSignedIn();
  }

  const creating = mode === 'sign-up';
  const describedBy = error ? errorId : undefined;
  return (
    <form onSubmit={submit} className="stack">
      <div className="field">
        <label htmlFor={emailId}>{t('signin.email')}</label>
        <input
          ref={emailRef}
          id={emailId}
          type="email"
          name="email"
          autoComplete={creating ? 'email' : 'username'}
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
        />
      </div>
      <div className="field">
        <label htmlFor={passwordId}>{creating ? t('signin.newPassword') : t('signin.password')}</label>
        <input
          id={passwordId}
          type="password"
          name="password"
          autoComplete={creating ? 'new-password' : 'current-password'}
          required
          minLength={creating ? 10 : undefined}
          maxLength={72}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
        />
      </div>
      <ErrorText id={errorId} code={error} />
      <button type="submit" className="btn primary" disabled={busy}>
        {busy ? t('common.sending') : creating ? t('signin.createSubmit') : t('signin.submit')}
      </button>
      <button
        type="button"
        className="btn ghost"
        onClick={() => {
          setMode(creating ? 'sign-in' : 'sign-up');
          setError(null);
        }}
      >
        {creating ? t('signin.toSignIn') : t('signin.toCreate')}
      </button>
      <p className="muted small">{t('signin.privacy')}</p>
    </form>
  );
}
