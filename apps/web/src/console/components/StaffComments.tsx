'use client';

// Comments as staff see them (US-19, US-33): every state (visible, held by the language filter, removed) with the
// number of citizen flags. Restore and remove need a reason; banning the author is for tenant admins.
import Link from 'next/link';
import { formatDateTime, type MessageKey } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { consoleReportPath } from '@/lib/console-paths';
import { useStaff } from '../StaffProvider';
import type { StaffComment } from '../types';
import { ReasonButton } from './ActionForms';

export function StaffComments({
  comments,
  moderate,
  ban,
  showReport = false,
  onChanged,
}: {
  comments: StaffComment[];
  moderate: boolean;
  ban: boolean;
  showReport?: boolean;
  onChanged: () => void;
}) {
  const { t, tp, locale } = useI18n();
  const { call } = useStaff();

  if (comments.length === 0) return <p className="muted">{t('console.comments.empty')}</p>;

  async function setState(id: string, state: 'visible' | 'removed', reason: string) {
    const result = await call(`staff/comments/${id}`, { method: 'PATCH', body: { state, reason } });
    if (result.ok) onChanged();
    return result;
  }

  async function banAuthor(accountId: string, reason: string) {
    const result = await call(`staff/accounts/${accountId}/ban`, { method: 'POST', body: { reason } });
    if (result.ok) onChanged();
    return result;
  }

  return (
    <ul className="comment-list">
      {comments.map((c, i) => (
        <li key={c.id} className={`comment staff-comment comment-${c.state}`}>
          <div className="comment-meta small">
            <span className="row">
              <span className={`tag state-${c.state}`}>{t(`console.comments.state.${c.state}` as MessageKey)}</span>
              {c.flagCount > 0 ? <span className="tag flag">{tp('console.comments.flags', c.flagCount)}</span> : null}
              {showReport && c.reportId ? <Link href={consoleReportPath(c.reportId)}>{c.reportId}</Link> : null}
              {showReport && c.tenantName ? <span className="muted">{c.tenantName}</span> : null}
            </span>
            {c.createdAt ? <span className="muted">{formatDateTime(locale, c.createdAt)}</span> : null}
          </div>
          <p>{c.body}</p>
          {moderate && c.editable !== false ? (
            <div className="row">
              {c.state !== 'visible' ? (
                <ReasonButton
                  label={t('console.comments.restore')}
                  title={t('console.comments.restoreTitle', { n: i + 1 })}
                  submit={(reason) => setState(c.id, 'visible', reason)}
                  success="console.comments.restored"
                />
              ) : null}
              {c.state !== 'removed' ? (
                <ReasonButton
                  label={t('console.comments.remove')}
                  title={t('console.comments.removeTitle', { n: i + 1 })}
                  submit={(reason) => setState(c.id, 'removed', reason)}
                  success="console.comments.removed"
                />
              ) : null}
              {ban && c.authorId ? (
                <ReasonButton
                  label={t('console.ban.button')}
                  title={t('console.ban.title')}
                  className="btn sm danger"
                  submit={(reason) => banAuthor(c.authorId!, reason)}
                  success="console.ban.done"
                />
              ) : null}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
