'use client';

// The signed-in staff member's settings in the console header: the Monday briefing email switch (US-56). A
// disclosure button, so it works with the keyboard; Esc closes it and returns focus to the button.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { useI18n } from '@/i18n/I18nProvider';
import { getsBriefingEmail } from '../permissions';
import { STAFF_SESSION_KEY, useStaff } from '../StaffProvider';
import type { StaffSession } from '../types';

export function AccountMenu() {
  const { t } = useI18n();
  const { me } = useStaff();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  if (!me) return null;
  return (
    <div className="account-menu" ref={wrap}>
      <button ref={button} type="button" className="btn sm" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        {t('console.account.menu')}
      </button>
      <div id={panelId} className="account-panel panel stack-sm" hidden={!open}>
        <p className="small">
          <strong>{t('console.account.title')}</strong>
        </p>
        <BriefingEmailSwitch />
      </div>
    </div>
  );
}

/** On by default (the API's default); PUT /staff/me/preferences { briefingEmail } changes it. */
export function BriefingEmailSwitch() {
  const { t } = useI18n();
  const { me, call } = useStaff();
  const queryClient = useQueryClient();
  const id = useId();
  const hintId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!me) return null;
  if (!getsBriefingEmail(me)) return <p className="small muted">{t('console.account.emailAdminsOnly')}</p>;
  const on = me.preferences?.briefingEmail ?? true;

  async function toggle(next: boolean) {
    setBusy(true);
    setError(null);
    setSaved(false);
    const result = await call('staff/me/preferences', { method: 'PUT', body: { briefingEmail: next } });
    setBusy(false);
    if (!result.ok) {
      setError(String(result.error));
      return;
    }
    queryClient.setQueryData<StaffSession>(STAFF_SESSION_KEY, (old) =>
      old?.me ? { ...old, me: { ...old.me, preferences: { ...old.me.preferences, briefingEmail: next } } } : old,
    );
    setSaved(true);
  }

  return (
    <div className="stack-sm">
      <label className="checkbox" htmlFor={id}>
        <input id={id} type="checkbox" role="switch" checked={on} disabled={busy} aria-describedby={hintId} onChange={(e) => void toggle(e.target.checked)} />
        {t('console.account.briefingEmail')}
      </label>
      <p id={hintId} className="small muted">
        {t('console.account.briefingEmailHint')}
      </p>
      <ErrorText code={error} />
      {saved ? (
        <p role="status" className="small success">
          {on ? t('console.account.emailOn') : t('console.account.emailOff')}
        </p>
      ) : null}
    </div>
  );
}
