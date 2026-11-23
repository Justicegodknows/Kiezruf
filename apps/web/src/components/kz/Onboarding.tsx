'use client';

// First visit (app prototype): the splash, then straight to the feed. User testing on 2026-11-23 (participant 1)
// found that asking for an email before any content, and a topic filter before the feed, made first-time visitors
// want to leave; the splash also did not say what Kiezruf is. So the splash now says what it is and who it is for, and
// "Start" opens the feed. An account is asked for only when someone signs or starts a petition (runAuthed opens the
// sign-in dialog, which can also create the account); topics are set later in the account. Shown once per browser.
import Link from 'next/link';
import { useId, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { markOnboarded, useWasOnboarded } from '@/lib/topics';
import { KzIcon } from './ui';

export function Onboarding() {
  const { t } = useI18n();
  const { loading } = useAuth();
  const onboarded = useWasOnboarded();
  const [done, setDone] = useState(false);
  const titleId = useId();

  if (loading || onboarded || done) return null;

  function finish() {
    markOnboarded();
    setDone(true);
  }

  return (
    <div className="kz-onboard" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="kz-onboard__screen">
        <svg className="kz-onboard__rings" viewBox="0 0 360 360" aria-hidden="true">
          <circle cx="180" cy="180" r="178" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1.5" strokeDasharray="5 7" />
          <circle cx="180" cy="180" r="118" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="1.5" />
          <circle cx="180" cy="180" r="62" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="1.5" />
        </svg>
        <div className="kz-onboard__splash">
          <span className="kz-logo">
            <KzIcon name="pin" size={22} stroke={2.2} />
          </span>
          <h1 id={titleId} className="kz-onboard__name">
            Kiezruf
          </h1>
          <p className="kz-onboard__tagline">{t('kz.tagline')}</p>
          <p className="kz-onboard__what">{t('kz.whatItIs')}</p>
        </div>
        <div className="kz-onboard__foot">
          <button type="button" className="kz-cta kz-cta--light" onClick={finish}>
            {t('kz.start')}
            <KzIcon name="arrow" size={18} stroke={2.4} />
          </button>
          <p className="kz-onboard__note">{t('kz.noAccountYet')}</p>
          <Link href="/console" prefetch={false} className="kz-onboard__console" onClick={markOnboarded}>
            {t('kz.consoleLong')}
          </Link>
        </div>
      </div>
    </div>
  );
}
