'use client';

// Console sign-in (ENG-09): the email code, then a 6-digit code from an authenticator app. On the first sign-in the
// API returns an otpauth URI: the page shows it as a QR code and the secret as text for manual entry, then asks for
// the first code to confirm enrolment. The staff session lives in an httpOnly cookie for 12 hours.
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { useI18n } from '@/i18n/I18nProvider';
import { api } from '@/lib/api-client';
import { safeConsoleNext } from '@/lib/console-paths';
import { fetchStaffSession, STAFF_SESSION_KEY } from '../StaffProvider';

type Step = { kind: 'email' } | { kind: 'code' } | { kind: 'totp' } | { kind: 'enroll'; otpauthUri: string | null; secret: string | null };

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
  const ids = { email: useId(), code: useId(), totp: useId(), error: useId(), qr: useId() };
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Already signed in (e.g. after a link from an email, which SameSite=Strict sends without the cookie).
  useEffect(() => {
    let cancelled = false;
    fetchStaffSession()
      .then((session) => {
        if (!cancelled && session.signedIn) {
          queryClient.setQueryData(STAFF_SESSION_KEY, session);
          router.replace(next);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [next, queryClient, router]);

  // Each step moves focus to its heading, so screen-reader users hear what changed (WCAG 2.4.3).
  useEffect(() => {
    if (step.kind !== 'email') headingRef.current?.focus();
  }, [step.kind]);

  function fail(code: unknown) {
    setBusy(false);
    setError(String(code));
  }

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
    const result = await api<{ next: 'totp' | 'enroll'; otpauthUri?: string | null; secret?: string | null }>('staff/auth/verify', {
      method: 'POST',
      body: { email: email.trim(), code },
    });
    if (!result.ok) return fail(result.error);
    setBusy(false);
    setCode('');
    setStep(result.data.next === 'enroll' ? { kind: 'enroll', otpauthUri: result.data.otpauthUri ?? null, secret: result.data.secret ?? null } : { kind: 'totp' });
  }

  async function confirmTotp(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await api('staff/auth/totp', { method: 'POST', body: { totp } });
    if (!result.ok) {
      setTotp('');
      if (result.error === 'challenge_expired') {
        setStep({ kind: 'email' });
      }
      return fail(result.error);
    }
    const session = await fetchStaffSession().catch(() => undefined);
    if (session) queryClient.setQueryData(STAFF_SESSION_KEY, session);
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
          <p role="status">{t('console.signin.totpIntro')}</p>
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
          {step.otpauthUri ? <QrCode uri={step.otpauthUri} labelId={ids.qr} /> : null}
          {step.secret ? (
            <div className="stack-sm">
              <p id={ids.qr}>{t('console.signin.enrollManual')}</p>
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

function QrCode({ uri, labelId }: { uri: string; labelId: string }) {
  const { t } = useI18n();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    import('qrcode')
      .then((QR) => QR.toDataURL(uri, { margin: 2, width: 240, errorCorrectionLevel: 'M' }))
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);
  if (failed) return <p className="small muted">{t('console.signin.qrFailed')}</p>;
  if (!src) return <p role="status">{t('common.loading')}</p>;
  // A data: URL generated in the browser; next/image adds nothing here.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={t('console.signin.qrAlt')} width={240} height={240} className="qr" aria-describedby={labelId} />;
}
