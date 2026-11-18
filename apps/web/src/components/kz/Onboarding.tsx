'use client';

// First visit (app prototype): splash, then "Make your Kiez heard" with a sign-up, then "What matters to you?".
// Every step can be skipped. Sign-up is email and password (ENG-24), not the prototype's name and email: accounts
// have no name, and Kiezruf signs in with a password. Shown once per browser (lib/topics.ts).
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useId, useState, type FormEvent } from 'react';
import { SESSION_QUERY_KEY, useAuth } from '@/auth/AuthProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { api } from '@/lib/api-client';
import { TOPICS, topicLabelKey, type TopicId } from '@/lib/petition';
import { markOnboarded, readTopics, saveTopics, useWasOnboarded } from '@/lib/topics';
import { ErrorText } from '../ErrorText';
import { KzIcon, PathIcon } from './ui';

type Step = 'splash' | 'signup' | 'topics';

export function Onboarding({ onTopics }: { onTopics?: (topics: TopicId[]) => void }) {
  const { t, tp, locale } = useI18n();
  const { signedIn, loading, requireSignIn } = useAuth();
  const queryClient = useQueryClient();
  const onboarded = useWasOnboarded();
  const [current, setStep] = useState<Step | 'done'>('splash');
  const step = loading || onboarded || current === 'done' ? null : current;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<TopicId[]>([]);
  const ids = { email: useId(), password: useId(), passwordHint: useId(), title: useId() };

  if (!step) return null;

  function finish(topics: TopicId[]) {
    saveTopics(topics);
    onTopics?.(topics);
    markOnboarded();
    setStep('done');
  }

  async function signUp(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await api('auth/sign-up', { method: 'POST', body: { email, password, locale } });
    setBusy(false);
    if (!result.ok) {
      setError(String(result.error));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    setPicked(readTopics());
    setStep('topics');
  }

  const toggle = (id: TopicId) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="kz-onboard" role="dialog" aria-modal="true" aria-labelledby={ids.title}>
      {step === 'splash' ? (
        <div className="kz-onboard__screen" key="splash">
          <svg className="kz-onboard__rings" viewBox="0 0 360 360" aria-hidden="true">
            <circle cx="180" cy="180" r="178" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1.5" strokeDasharray="5 7" />
            <circle cx="180" cy="180" r="118" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="1.5" />
            <circle cx="180" cy="180" r="62" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="1.5" />
          </svg>
          <div className="kz-onboard__splash">
            <span className="kz-logo">
              <KzIcon name="pin" size={22} stroke={2.2} />
            </span>
            <h1 id={ids.title} className="kz-onboard__name">
              Kiezruf
            </h1>
            <p className="kz-onboard__tagline">{t('kz.tagline')}</p>
          </div>
          <div className="kz-onboard__foot">
            <button type="button" className="kz-cta kz-cta--light" onClick={() => setStep(signedIn ? 'topics' : 'signup')}>
              {t('kz.start')}
              <KzIcon name="arrow" size={18} stroke={2.4} />
            </button>
            <Link href="/console" className="kz-onboard__console" onClick={markOnboarded}>
              {t('kz.consoleLong')}
            </Link>
          </div>
        </div>
      ) : null}

      {step === 'signup' ? (
        <div className="kz-onboard__screen" key="signup">
          <div className="kz-onboard__top">
            <span className="kz-onboard__brand">
              <span className="kz-logo kz-logo--sm">
                <KzIcon name="pin" size={16} stroke={2.4} />
              </span>
              Berlin
            </span>
            <button type="button" className="kz-onboard__skip" onClick={() => setStep('topics')}>
              {t('kz.skip')}
            </button>
          </div>
          <div className="kz-onboard__hero">
            <h1 id={ids.title}>{t('kz.heroTitle')}</h1>
            <p>{t('kz.heroSub')}</p>
          </div>
          <form className="kz-onboard__form" onSubmit={signUp} noValidate>
            <label className="kz-field" htmlFor={ids.email}>
              {t('kz.email')}
              <input id={ids.email} type="email" autoComplete="email" placeholder="du@beispiel.de" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="kz-field" htmlFor={ids.password}>
              {t('kz.password')}
              <input
                id={ids.password}
                type="password"
                autoComplete="new-password"
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby={ids.passwordHint}
                required
              />
              <span id={ids.passwordHint} className="kz-note">
                {t('kz.passwordHint')}
              </span>
            </label>
            <p className="kz-note">{t('kz.emailNote')}</p>
            <ErrorText code={error} />
            <button type="submit" className="kz-cta" disabled={busy || !email || password.length < 10}>
              {busy ? t('common.loading') : t('kz.continue')}
              <KzIcon name="arrow" size={18} stroke={2.4} />
            </button>
            <button
              type="button"
              className="kz-link-button"
              onClick={async () => {
                if (await requireSignIn()) {
                  setPicked(readTopics());
                  setStep('topics');
                }
              }}
            >
              {t('kz.haveAccount')}
            </button>
          </form>
        </div>
      ) : null}

      {step === 'topics' ? (
        <div className="kz-onboard__screen" key="topics">
          <div className="kz-onboard__top">
            <button type="button" className="kz-round" style={{ background: 'rgba(255,255,255,.14)', borderColor: 'rgba(255,255,255,.4)', color: '#fff' }} onClick={() => setStep(signedIn ? 'splash' : 'signup')} aria-label={t('kz.back')}>
              <KzIcon name="back" size={18} stroke={2.4} />
            </button>
            <button type="button" className="kz-onboard__skip" onClick={() => finish([])}>
              {t('kz.skip')}
            </button>
          </div>
          <div className="kz-onboard__topics">
            <h1 id={ids.title}>{t('kz.topicsTitle')}</h1>
            <div className="kz-topics">
              {TOPICS.map((x) => {
                const on = picked.includes(x.id);
                return (
                  <button key={x.id} type="button" className="kz-topic" aria-pressed={on} onClick={() => toggle(x.id)}>
                    <span className="kz-topic__icon">
                      <PathIcon d={x.icon} />
                    </span>
                    {on ? (
                      <span className="kz-topic__check">
                        <KzIcon name="check" size={13} stroke={3} />
                      </span>
                    ) : null}
                    <span>{t(topicLabelKey(x.id))}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="kz-onboard__foot">
            <p className="kz-onboard__note" aria-live="polite">
              {picked.length ? tp('kz.topicsSelected', picked.length) : t('kz.skipAll')}
            </p>
            <button type="button" className="kz-cta kz-cta--light" onClick={() => finish(picked)}>
              {t('kz.showPetitions')}
              <KzIcon name="arrow" size={18} stroke={2.4} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
