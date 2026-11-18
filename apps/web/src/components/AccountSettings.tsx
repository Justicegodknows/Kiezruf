'use client';

// Account (US-29, US-34, US-35) after the app prototype: language and topics for everyone; signed in, the citizen's
// petitions, email notifications, sign out and deleting the account.
// On the web only the email switches matter; push settings are kept as they are.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useId, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { useChangeLocale } from '@/auth/useChangeLocale';
import { LOCALES } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { api, apiOrThrow, type NotificationSettings } from '@/lib/api-client';
import { initialsOf, TOPICS, topicLabelKey, type TopicId } from '@/lib/petition';
import { saveTopics, useTopics } from '@/lib/topics';
import { Dialog } from './Dialog';
import { KzIcon, PathIcon } from './kz/ui';
import { ErrorText } from './ErrorText';
import { SignedInOnly } from './SignedInOnly';

export function AccountSettings() {
  const { t, locale } = useI18n();
  const { session, signedIn } = useAuth();
  const changeLocale = useChangeLocale();
  const router = useRouter();
  const [languageError, setLanguageError] = useState<string | null>(null);
  const topics = useTopics();
  const ids = { language: useId(), topics: useId(), contact: useId() };

  async function onLanguage(next: (typeof LOCALES)[number]) {
    setLanguageError(null);
    const result = await changeLocale(next);
    if (result && !result.ok) setLanguageError(String(result.error));
  }

  function toggleTopic(id: TopicId) {
    const next = topics.includes(id) ? topics.filter((x) => x !== id) : [...topics, id];
    saveTopics(next);
  }

  return (
    <div className="stack" style={{ gap: 28 }}>
      <div className="kz-me">
        <span className="kz-me__avatar" aria-hidden="true">
          {initialsOf(session?.email) ?? 'Me'}
        </span>
        <div className="stack-sm" style={{ minWidth: 0 }}>
          <span className="kz-me__name">{signedIn ? (session?.email ?? t('kz.yourAccount')) : t('kz.guest')}</span>
          <span className="kz-note">{signedIn ? t('account.signedInAs', { email: session?.email ?? '' }) : t('kz.guestNote')}</span>
        </div>
      </div>

      <section className="kz-group" aria-labelledby={ids.language}>
        <h2 id={ids.language} className="kz-label">
          {t('kz.language')}
        </h2>
        <div className="kz-segmented" role="group" aria-labelledby={ids.language}>
          {(['en', 'de'] as const).map((l) => (
            <button key={l} type="button" lang={l} aria-pressed={locale === l} onClick={() => void onLanguage(l)}>
              {l === 'en' ? 'English' : 'Deutsch'}
            </button>
          ))}
        </div>
        <ErrorText code={languageError} />
      </section>

      <section className="kz-group" aria-labelledby={ids.topics}>
        <h2 id={ids.topics} className="kz-label">
          {t('kz.yourTopics')}
        </h2>
        <p className="kz-note">{t('kz.topicsNote')}</p>
        <div className="kz-topics">
          {TOPICS.map((x) => {
            const on = topics.includes(x.id);
            return (
              <button key={x.id} type="button" className="kz-topic" aria-pressed={on} onClick={() => toggleTopic(x.id)}>
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
      </section>

      <SignedInOnly why={t('account.signInWhy')}>
        <AccountBody />
      </SignedInOnly>

      <div className="kz-sticky-foot">
        <button type="button" className="kz-cta" onClick={() => router.push('/')}>
          {t('kz.saveClose')}
        </button>
      </div>
    </div>
  );
}

function AccountBody() {
  const { t } = useI18n();
  const { signOut, markSignedOut } = useAuth();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const ids = { petitions: useId(), notifications: useId(), danger: useId(), confirm: useId() };

  async function deleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    const result = await api('me', { method: 'DELETE' });
    setDeleting(false);
    if (!result.ok) {
      setDeleteError(String(result.error));
      return;
    }
    setConfirmOpen(false);
    setDeleted(true);
    markSignedOut();
  }

  if (deleted) {
    return (
      <p role="status" className="success">
        {t('account.deleted')}
      </p>
    );
  }

  return (
    <div className="stack" style={{ gap: 28 }}>
      <section className="kz-group" aria-labelledby={ids.petitions}>
        <h2 id={ids.petitions} className="kz-label">
          {t('kz.yourPetitions')}
        </h2>
        <Link href="/my-reports" className="kz-row-link">
          {t('kz.myPetitions')}
          <KzIcon name="arrow" size={18} stroke={2.2} />
        </Link>
        <Link href="/following" className="kz-row-link">
          {t('kz.followed')}
          <KzIcon name="arrow" size={18} stroke={2.2} />
        </Link>
      </section>

      <section className="kz-group" aria-labelledby={ids.notifications}>
        <h2 id={ids.notifications} className="kz-label">
          {t('account.notifications')}
        </h2>
        <div className="kz-panel">
          <NotificationSwitches />
        </div>
      </section>

      <section className="kz-group">
        <button
          type="button"
          className="kz-cta kz-cta--light"
          onClick={async () => {
            await signOut();
            router.push('/');
          }}
        >
          {t('kz.signOut')}
        </button>
      </section>

      <section aria-labelledby={ids.danger} className="kz-group danger-zone">
        <h2 id={ids.danger} className="kz-label">
          {t('account.delete')}
        </h2>
        <p className="kz-note">{t('account.deleteExplain')}</p>
        <button type="button" className="btn danger" onClick={() => setConfirmOpen(true)}>
          {t('account.delete')}
        </button>
      </section>

      <Dialog open={confirmOpen} title={t('account.deleteConfirmTitle')} onClose={() => setConfirmOpen(false)} describedBy={ids.confirm}>
        <p id={ids.confirm}>{t('account.deleteConfirmBody')}</p>
        <ErrorText code={deleteError} />
        <div className="row">
          <button type="button" className="btn danger" onClick={deleteAccount} disabled={deleting}>
            {deleting ? t('common.sending') : t('account.deleteConfirm')}
          </button>
          <button type="button" className="btn" onClick={() => setConfirmOpen(false)}>
            {t('common.cancel')}
          </button>
        </div>
      </Dialog>
    </div>
  );
}

function NotificationSwitches() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const queryKey = ['me', 'notification-settings'];
  const query = useQuery({ queryKey, queryFn: () => apiOrThrow<NotificationSettings>('me/notification-settings') });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const ids = { status: useId(), goLive: useId() };

  if (query.isPending) return <p role="status">{t('common.loading')}</p>;
  if (query.isError) return <ErrorText code={(query.error as { code?: string }).code ?? 'unknown'} />;
  const settings = query.data;

  async function toggle(kind: keyof NotificationSettings, email: boolean) {
    setError(null);
    setSaved(false);
    const next: NotificationSettings = { ...settings, [kind]: { ...settings[kind], email } };
    queryClient.setQueryData(queryKey, next);
    const result = await api<NotificationSettings>('me/notification-settings', { method: 'PUT', body: next });
    if (!result.ok) {
      queryClient.setQueryData(queryKey, settings);
      setError(String(result.error));
      return;
    }
    if (result.data) queryClient.setQueryData(queryKey, result.data);
    setSaved(true);
  }

  return (
    <div className="stack-sm">
      <p className="small">{t('account.notificationsExplain')}</p>
      <label className="checkbox" htmlFor={ids.status}>
        <input id={ids.status} type="checkbox" role="switch" checked={settings.statusChange.email} onChange={(e) => void toggle('statusChange', e.target.checked)} />
        {t('account.emailStatusChange')}
      </label>
      <label className="checkbox" htmlFor={ids.goLive}>
        <input id={ids.goLive} type="checkbox" role="switch" checked={settings.goLive.email} onChange={(e) => void toggle('goLive', e.target.checked)} />
        {t('account.emailGoLive')}
      </label>
      <ErrorText code={error} />
      {saved ? (
        <p role="status" className="small success">
          {t('account.saved')}
        </p>
      ) : null}
    </div>
  );
}
