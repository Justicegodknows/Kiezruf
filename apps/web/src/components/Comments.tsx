'use client';

// Comments (US-19): flat list, oldest first, no author shown. Up to 500 characters. A comment the language
// filter holds is not shown until staff review it. Every comment has a flag button.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { formatDateTime } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { api, apiOrThrow, type Comment } from '@/lib/api-client';
import { ErrorText } from './ErrorText';

export const MAX_COMMENT_LENGTH = 500;

export function Comments({ publicId }: { publicId: string }) {
  const { t, tp, locale } = useI18n();
  const { runAuthed } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['comments', publicId];
  const query = useQuery({ queryKey, queryFn: () => apiOrThrow<{ comments: Comment[] }>(`public/reports/${publicId}/comments`) });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<'posted' | 'held' | null>(null);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [flagError, setFlagError] = useState<string | null>(null);
  const headingId = useId();
  const fieldId = useId();
  const counterId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await runAuthed(() => api<{ held?: boolean }>(`reports/${publicId}/comments`, { method: 'POST', body: { body } }));
    setBusy(false);
    if (!result) return;
    if (!result.ok) {
      setError(String(result.error));
      return;
    }
    setText('');
    setNotice(result.data?.held ? 'held' : 'posted');
    await queryClient.invalidateQueries({ queryKey });
  }

  async function flag(id: string) {
    setFlagError(null);
    const result = await runAuthed(() => api(`comments/${id}/flag`, { method: 'POST', body: {} }));
    if (!result) return;
    if (!result.ok) {
      setFlagError(String(result.error));
      return;
    }
    setFlagged((prev) => new Set(prev).add(id));
  }

  const comments = query.data?.comments ?? [];

  return (
    <section className="comments" aria-labelledby={headingId}>
      <h3 id={headingId}>{query.data ? tp('comments.title', comments.length) : t('comments.titlePlain')}</h3>
      {query.isPending ? <p className="small muted">{t('common.loading')}</p> : null}
      {query.isError ? <ErrorText code={(query.error as { code?: string }).code ?? 'unknown'} /> : null}
      {query.data && comments.length === 0 ? <p className="small muted">{t('comments.empty')}</p> : null}
      <ol className="comment-list">
        {comments.map((c, index) => (
          <li key={c.id} className="comment">
            <p>{c.body}</p>
            <div className="comment-meta">
              <span className="small muted">
                {t('comments.neighbour')} · {formatDateTime(locale, c.createdAt)}
              </span>
              {flagged.has(c.id) ? (
                <span className="small" role="status">
                  {t('comments.flagged')}
                </span>
              ) : (
                <button type="button" className="btn ghost sm" onClick={() => flag(c.id)} aria-label={t('comments.flagLabel', { n: index + 1 })}>
                  <span aria-hidden="true">⚑ </span>
                  {t('comments.flag')}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
      <ErrorText code={flagError} />
      <form onSubmit={submit} className="stack-sm">
        <label htmlFor={fieldId}>{t('comments.add')}</label>
        <textarea
          id={fieldId}
          rows={3}
          maxLength={MAX_COMMENT_LENGTH}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-describedby={counterId}
          required
        />
        <p id={counterId} className="small muted">
          {t('comments.counter', { used: text.length, max: MAX_COMMENT_LENGTH })}
        </p>
        <ErrorText code={error} />
        {notice ? (
          <p role="status" className={notice === 'held' ? 'notice info' : 'success'}>
            {notice === 'held' ? t('comments.held') : t('comments.posted')}
          </p>
        ) : null}
        <button type="submit" className="btn primary" disabled={busy || text.trim().length === 0}>
          {busy ? t('common.sending') : t('comments.submit')}
        </button>
      </form>
    </section>
  );
}
