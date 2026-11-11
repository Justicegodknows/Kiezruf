'use client';

// Account (US-29, US-34, US-35): language, email notifications, sign out, delete the account.
// On the web only the email switches matter; push settings are kept as they are.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { useChangeLocale } from '@/auth/useChangeLocale';
import { LOCALES, type MessageKey } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { api, apiOrThrow, type NotificationSettings } from '@/lib/api-client';
import { Dialog } from './Dialog';
import { ErrorText } from './ErrorText';
import { SignedInOnly } from './SignedInOnly';

export function AccountSettings() {
  const { t } = useI18n();
  return (
    <SignedInOnly why={t('account.signInWhy')}>
      <AccountBody />
    </SignedInOnly>
  );
}

function AccountBody() {
  const { t, locale } = useI18n();
  const { session, signOut, markSignedOut } = useAuth();
  const changeLocale = useChangeLocale();
  const router = useRouter();
  const [languageError, setLanguageError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const ids = { language: useId(), notifications: useId(), danger: useId(), confirm: useId() };

  async function onLanguage(next: (typeof LOCALES)[number]) {
    setLanguageError(null);
    const result = await changeLocale(next);
    if (result && !result.ok) setLanguageError(String(result.error));
  }

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
    <div className="stack">
      {session?.email ? <p>{t('account.signedInAs', { email: session.email })}</p> : null}

      <section aria-labelledby={ids.language} className="stack-sm">
        <h2 id={ids.language}>{t('account.language')}</h2>
        <fieldset className="radio-group">
          <legend className="visually-hidden">{t('account.language')}</legend>
          {LOCALES.map((l) => (
            <label key={l} className="radio" lang={l}>
              <input type="radio" name="language" value={l} checked={locale === l} onChange={() => void onLanguage(l)} />
              {t(`language.${l}` as MessageKey)}
            </label>
          ))}
        </fieldset>
        <ErrorText code={languageError} />
      </section>

      <section aria-labelledby={ids.notifications} className="stack-sm">
        <h2 id={ids.notifications}>{t('account.notifications')}</h2>
        <NotificationSwitches />
      </section>

      <section className="stack-sm">
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await signOut();
            router.push('/');
          }}
        >
          {t('account.signOut')}
        </button>
      </section>

      <section aria-labelledby={ids.danger} className="stack-sm danger-zone">
        <h2 id={ids.danger}>{t('account.delete')}</h2>
        <p>{t('account.deleteExplain')}</p>
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
