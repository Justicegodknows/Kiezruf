'use client';

// Console sign-in (ENG-22): Supabase email code, then Supabase MFA with an authenticator app (TOTP). The first time,
// the server enrols a TOTP factor and the page shows the QR code Supabase returns, with the secret as text for
// manual entry (and as the QR code's text alternative), then asks for the first code. Afterwards it is challenge
// and verify. Only an `aal2` session reaches the console; the TOTP check is good for 12 hours. All Supabase calls
// run on the server (/api/auth/*), so the session stays in httpOnly cookies.
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { useI18n } from '@/i18n/I18nProvider';
import { api } from '@/lib/api-client';
import { safeConsoleNext } from '@/lib/console-paths';
import { fetchStaffSession, STAFF_SESSION_KEY } from '../StaffProvider';

type Step =
  | { kind: 'email' }
  | { kind: 'code' }
  | { kind: 'totp'; again: boolean }
  | { kind: 'enroll'; qrCode: string | null; secret: string | null };

type MfaStart = { next: 'totp' } | { next: 'enroll'; qrCode?: string | null; secret?: string | null };

/** "JBSWY3DPEHPK3PXP" → "JBSW Y3DP EHPK 3PXP", easier to type into an authenticator app. */
export function groupSecret(secret: string): string {
  return secret.replace(/\s+/g, '').replace(/(.{4})(?=.)/g, '$1 ');
}

export function SignInPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const next = safeConsoleNext(params.get('next'));
  const [step, setStep] = useState<Step>({ kind: 'email' });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [totp, setTotp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = { email: useId(), code: useId(), totp: useId(), error: useId(), secret: useId() };
  const headingRef = useRef<HTMLHeadingElement>(null);

  function fail(code: unknown) {
    setBusy(false);
    setError(String(code));
  }

  /** The second step: TOTP for an enrolled staff member, enrolment (QR code and secret) the first time. */
  const startMfa = useCallback(async (again: boolean): Promise<boolean> => {
    const result = await api<MfaStart>('auth/mfa', { method: 'POST' });
    setBusy(false);
    if (!result.ok) {
      setError(String(result.error));
      if (result.status === 401) setStep({ kind: 'email' });
      return false;
    }
    setTotp('');
    if (result.data.next === 'enroll') setStep({ kind: 'enroll', qrCode: result.data.qrCode ?? null, secret: result.data.secret ?? null });
    else setStep({ kind: 'totp', again });
    return true;
  }, []);

  // Already signed in: straight to the console, or to the step that is missing (TOTP older than 12 hours, or
  // signed in on the citizen pages without it). An account without a staff role sees why it cannot go on.
  useEffect(() => {
    let cancelled = false;
    fetchStaffSession()
      .then((session) => {
        if (cancelled) return;
        if (session.signedIn) {
          queryClient.setQueryData(STAFF_SESSION_KEY, session);
          router.replace(next);
        } else if (session.reason === 'mfa_required') {
          void startMfa(true);
        } else if (session.reason === 'not_staff') {
          setError('not_staff');
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [next, queryClient, router, startMfa]);

  // Each step change (also back to the email step after an error) moves focus to the heading, so focus never
  // drops to the page body and screen-reader users hear what changed (WCAG 2.4.3). Not on the first render.
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step.kind]);

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await api('auth/code', { method: 'POST', body: { email: email.trim(), locale } });
    if (!result.ok) return fail(result.error);
    setBusy(false);
    setStep({ kind: 'code' });
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await api('auth/verify', { method: 'POST', body: { email: email.trim(), code } });
    if (!result.ok) return fail(result.error);
    setCode('');
    await startMfa(false);
  }

  async function confirmTotp(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await api('auth/mfa/verify', { method: 'POST', body: { code: totp } });
    if (!result.ok) {
      setTotp('');
      if (result.error === 'challenge_expired' || result.status === 401) setStep({ kind: 'email' });
      return fail(result.error);
    }
    const session = await fetchStaffSession().catch(() => undefined);
    if (!session?.signedIn) {
      setStep({ kind: 'email' });
      return fail(session?.reason === 'not_staff' ? 'not_staff' : 'unavailable');
    }
    queryClient.setQueryData(STAFF_SESSION_KEY, session);
    router.replace(next);
  }

  function restart() {
    setStep({ kind: 'email' });
    setCode('');
    setTotp('');
    setError(null);
  }

  const totpField = (
    <div className="field">
      <label htmlFor={ids.totp}>{t('console.signin.totp')}</label>
      <input
        id={ids.totp}
        name="totp"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        required
        value={totp}
        onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
        aria-describedby={error ? ids.error : undefined}
        aria-invalid={error ? true : undefined}
      />
    </div>
  );

  return (
    <div className="page narrow stack">
      <div>
        <h1 ref={headingRef} tabIndex={-1}>
          {step.kind === 'enroll' ? t('console.signin.enrollTitle') : t('console.signin.title')}
        </h1>
        {step.kind === 'email' ? <p className="lead">{t('console.signin.intro')}</p> : null}
      </div>

      {step.kind === 'email' ? (
        <form onSubmit={sendCode} className="stack">
          <div className="field">
            <label htmlFor={ids.email}>{t('console.signin.email')}</label>
            <input
              id={ids.email}
              type="email"
              name="email"
              autoComplete="username"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={error ? ids.error : undefined}
              aria-invalid={error ? true : undefined}
            />
          </div>
          <ErrorText id={ids.error} code={error} />
          <button type="submit" className="btn primary" disabled={busy || !email.trim()}>
            {busy ? t('common.sending') : t('signin.sendCode')}
          </button>
        </form>
      ) : null}

      {step.kind === 'code' ? (
        <form onSubmit={verify} className="stack">
          <p role="status">{t('signin.codeSent', { email: email.trim() })}</p>
          <div className="field">
            <label htmlFor={ids.code}>{t('signin.code')}</label>
            <input
              id={ids.code}
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              aria-describedby={error ? ids.error : undefined}
              aria-invalid={error ? true : undefined}
            />
          </div>
          <ErrorText id={ids.error} code={error} />
          <button type="submit" className="btn primary" disabled={busy || code.length !== 6}>
            {busy ? t('common.sending') : t('console.signin.next')}
          </button>
          <button type="button" className="btn ghost" onClick={restart}>
            {t('signin.otherEmail')}
          </button>
        </form>
      ) : null}

      {step.kind === 'totp' ? (
        <form onSubmit={confirmTotp} className="stack">
          <p role="status">{step.again ? t('console.signin.mfaAgain') : t('console.signin.totpIntro')}</p>
          {totpField}
          <ErrorText id={ids.error} code={error} />
          <button type="submit" className="btn primary" disabled={busy || totp.length !== 6}>
            {busy ? t('common.sending') : t('console.signin.submit')}
          </button>
          <button type="button" className="btn ghost" onClick={restart}>
            {t('console.signin.restart')}
          </button>
        </form>
      ) : null}

      {step.kind === 'enroll' ? (
        <form onSubmit={confirmTotp} className="stack">
          <p role="status">{t('console.signin.enrollIntro')}</p>
          {step.qrCode ? (
            // A data: URL from Supabase (SVG); next/image adds nothing here. The secret below is its text alternative.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={step.qrCode}
              alt={t('console.signin.qrAlt')}
              width={240}
              height={240}
              className="qr"
              aria-describedby={step.secret ? ids.secret : undefined}
            />
          ) : (
            <p className="small muted">{t('console.signin.qrFailed')}</p>
          )}
          {step.secret ? (
            <div className="stack-sm" id={ids.secret}>
              <p>{t('console.signin.enrollManual')}</p>
              <p>
                <code className="secret" data-testid="totp-secret">
                  {groupSecret(step.secret)}
                </code>
              </p>
            </div>
          ) : null}
          <p>{t('console.signin.enrollConfirm')}</p>
          {totpField}
          <ErrorText id={ids.error} code={error} />
          <button type="submit" className="btn primary" disabled={busy || totp.length !== 6}>
            {busy ? t('common.sending') : t('console.signin.enrollSubmit')}
          </button>
          <button type="button" className="btn ghost" onClick={restart}>
            {t('console.signin.restart')}
          </button>
        </form>
      ) : null}
    </div>
  );
}
