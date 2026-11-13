'use client';

// Flagged & moderation (US-26, US-33, US-37): comments held by the language filter or flagged by citizens, vote
// spikes (more than 10 votes in 60 minutes, over half from accounts younger than 7 days) and reports held after
// the blur failed. Viewers read; case workers and tenant admins act; only tenant admins ban.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ErrorText } from '@/components/ErrorText';
import { categoryLabel } from '@/components/labels';
import { formatDateTime } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { apiOrThrow } from '@/lib/api-client';
import { consoleReportPath } from '@/lib/console-paths';
import { SpikeActions } from '../components/ActionForms';
import { StaffComments } from '../components/StaffComments';
import { canBan, canModerate } from '../permissions';
import { useStaff } from '../StaffProvider';
import { normalizeModeration } from '../types';

export function ModerationPage() {
  const { t, tp, locale } = useI18n();
  const { me, call } = useStaff();
  const queryClient = useQueryClient();
  const queue = useQuery({ queryKey: ['staff', 'moderation'], queryFn: async () => normalizeModeration(await apiOrThrow<unknown>('staff/moderation')) });
  const refresh = () => void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'staff' && q.queryKey[1] !== 'session' });
  const moderate = canModerate(me);

  return (
    <div className="console-page stack">
      <div>
        <h1>{t('console.moderation.title')}</h1>
        <p className="small muted">{t('console.spike.rule')}</p>
        {!moderate ? <p className="notice small">{t('console.moderation.readOnly')}</p> : null}
      </div>
      {queue.isPending ? <p role="status">{t('common.loading')}</p> : null}
      {queue.isError ? <ErrorText code={(queue.error as { code?: string }).code ?? 'unknown'} /> : null}
      {queue.data ? (
        <>
          <section aria-labelledby="mod-comments" className="panel">
            <h2 id="mod-comments">{tp('console.moderation.comments', queue.data.comments.length)}</h2>
            <StaffComments comments={queue.data.comments} moderate={moderate} ban={canBan(me)} showReport onChanged={refresh} />
          </section>

          <section aria-labelledby="mod-spikes" className="panel">
            <h2 id="mod-spikes">{tp('console.moderation.spikes', queue.data.spikes.length)}</h2>
            {queue.data.spikes.length === 0 ? <p className="muted">{t('console.moderation.nothing')}</p> : null}
            <ul className="plain-list">
              {queue.data.spikes.map((s) => (
                <li key={s.publicId} className="stack-sm mod-item">
                  <p>
                    <Link href={consoleReportPath(s.publicId)}>
                      {s.category ? `${categoryLabel(t, s.category)} · ` : ''}
                      <span className="mono">{s.publicId}</span>
                    </Link>
                    {s.tenant.name ? <span className="small muted"> · {s.tenant.name}</span> : null}
                  </p>
                  {s.votes !== null && s.newAccountVotes !== null ? (
                    <p className="small">{t('console.spike.summary', { votes: s.votes, newAccounts: s.newAccountVotes })}</p>
                  ) : s.votes !== null ? (
                    <p className="small">{tp('meToo.count', s.votes)}</p>
                  ) : null}
                  {s.flaggedAt ? <p className="small muted">{t('console.spike.flaggedAt', { at: formatDateTime(locale, s.flaggedAt) })}</p> : null}
                  {s.editable && moderate ? (
                    <SpikeActions
                      submit={async (body) => {
                        const result = await call(`staff/reports/${s.publicId}/spike`, { method: 'POST', body });
                        if (result.ok) refresh();
                        return result;
                      }}
                    />
                  ) : (
                    <p className="small muted">{t('console.marker.readOnly')}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="mod-held" className="panel">
            <h2 id="mod-held">{tp('console.moderation.heldReports', queue.data.heldReports.length)}</h2>
            <p className="small muted">{t('console.moderation.heldExplainReasons')}</p>
            {queue.data.heldReports.length === 0 ? <p className="muted">{t('console.moderation.nothing')}</p> : null}
            <ul className="plain-list">
              {queue.data.heldReports.map((r) => (
                <li key={r.publicId} className="mod-item">
                  <Link href={consoleReportPath(r.publicId)}>
                    {r.category ? `${categoryLabel(t, r.category)} · ` : ''}
                    <span className="mono">{r.publicId}</span>
                  </Link>
                  {r.tenant.name ? <span className="small muted"> · {r.tenant.name}</span> : null}
                  {r.createdAt ? <span className="small muted"> · {formatDateTime(locale, r.createdAt)}</span> : null}
                  {r.reason ? (
                    <p className="small">
                      <span className="tag state-held">{t(`console.moderation.heldReason.${r.reason}`)}</span>
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
