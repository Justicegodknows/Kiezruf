'use client';

// Report detail in the console (US-22, US-23, US-27, US-28, US-45, US-17, US-26): photos (blurred, and the original
// behind a short-lived link), map position, description, capture data, all comments with flag counts, history and
// the score breakdown. The actions show only when the report is editable for the signed-in grants; roll-up levels
// and viewers read.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ErrorText } from '@/components/ErrorText';
import { categoryLabel, groupLabel, statusLabel } from '@/components/labels';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime, formatNumber, type MessageKey } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { apiOrThrow } from '@/lib/api-client';
import { CONSOLE_QUEUE, consoleReportPath } from '@/lib/console-paths';
import { ForwardForm, MergeForm, OverrideForm, SpikeActions, StatusForm } from '../components/ActionForms';
import { LevelChip } from '../components/LevelChip';
import { LocationMap } from '../components/LocationMap';
import { MergeSuggestions } from '../components/MergeSuggestions';
import { ScoreBreakdown } from '../components/ScoreBreakdown';
import { StaffComments } from '../components/StaffComments';
import { formatScore, levelLabel } from '../format';
import { canBan, canEditReport, canModerate } from '../permissions';
import { useStaff } from '../StaffProvider';
import { forwardTargetsFrom } from '../tenants';
import { normalizeContacts, normalizeDetail, normalizeQueue, splitForwardTenants, type HistoryEntry, type StaffReportDetail } from '../types';
import { useStaffTenants } from './QueuePage';

const HISTORY_KINDS = new Set(['created', 'status', 'level', 'override', 'forward', 'merge', 'spike', 'comment', 'ban']);

export function ReportPage({ publicId }: { publicId: string }) {
  const { t, locale } = useI18n();
  const { me, call } = useStaff();
  const queryClient = useQueryClient();
  const router = useRouter();
  const key = ['staff', 'report', publicId];
  const report = useQuery({ queryKey: key, queryFn: async () => normalizeDetail(await apiOrThrow<unknown>(`staff/reports/${publicId}`)) });

  if (report.isPending) return <p role="status">{t('common.loading')}</p>;
  if (report.isError) {
    const code = (report.error as { code?: string }).code ?? 'unknown';
    return (
      <div className="console-page">
        <p>
          <Link href={CONSOLE_QUEUE}>{t('console.report.back')}</Link>
        </p>
        <h1>{code === 'not_found' ? t('console.report.notFound') : t('console.report.title')}</h1>
        {code === 'not_found' ? <p>{t('console.report.notFoundBody')}</p> : <ErrorText code={code} />}
      </div>
    );
  }

  const r = report.data;
  const editable = canEditReport(me, r);
  const refresh = () => queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'staff' && q.queryKey[1] !== 'session' });
  const act = async (path: string, method: string, body: unknown) => {
    const result = await call(`staff/reports/${publicId}/${path}`, { method, body });
    if (result.ok) await refresh();
    return result;
  };

  return (
    <article className="console-page report-page" aria-labelledby="report-title">
      <p className="small">
        <Link href={CONSOLE_QUEUE}>{t('console.report.back')}</Link>
      </p>
      <div className="report-head">
        <p className="small muted">
          {groupLabel(t, r.category)} · <span className="mono">{r.publicId}</span> · {r.tenant.name}
        </p>
        <h1 id="report-title">{categoryLabel(t, r.category)}</h1>
        <div className="row">
          <LevelChip level={r.level} override={r.override} showReason />
          <StatusBadge status={r.status} label={statusLabel(t, r.status)} />
          {r.dangerous ? <span className="tag danger">{t('report.dangerous')}</span> : null}
          {r.spike ? <span className="tag flag">{t('console.marker.spike')}</span> : null}
          {!editable ? <span className="tag">{t('console.marker.readOnly')}</span> : null}
        </div>
        <p className="small">
          {t('console.report.scoreLine', { score: formatScore(locale, r.score), level: levelLabel(t, r.level) })}
          {r.levelChangedAt ? ` · ${t('console.queue.levelSince', { at: formatDateTime(locale, r.levelChangedAt) })}` : ''}
        </p>
      </div>

      <div className="report-grid">
        <div className="stack">
          <Photos report={r} />
          {r.lat !== null && r.lon !== null ? <LocationMap lat={r.lat} lon={r.lon} label={t('console.report.mapPosition')} /> : null}
          <Facts report={r} />
          {r.publicNote ? (
            <section className="notice info" aria-labelledby="public-note-title">
              <h2 id="public-note-title">{t('console.report.publicNote')}</h2>
              <p>{r.publicNote}</p>
            </section>
          ) : null}
          <section aria-labelledby="comments-title">
            <h2 id="comments-title">{t('console.comments.title')}</h2>
            <StaffComments comments={r.comments} moderate={editable && canModerate(me, r.tenant.path)} ban={editable && canBan(me)} onChanged={() => void refresh()} />
          </section>
          <History entries={r.history} />
        </div>
        <div className="stack">
          <MergeSuggestions
            publicId={r.publicId}
            editable={editable}
            merge={async (duplicate) => {
              const result = await call(`staff/reports/${duplicate}/merge`, { method: 'POST', body: { into: r.publicId } });
              if (result.ok) await refresh();
              return result;
            }}
          />
          {r.breakdown ? <ScoreBreakdown breakdown={r.breakdown} /> : <p className="muted">{t('console.breakdown.missing')}</p>}
          {r.spike ? (
            <section className="panel" aria-labelledby="spike-title">
              <h2 id="spike-title">{t('console.spike.title')}</h2>
              <p className="small">{t('console.spike.rule')}</p>
              {r.spikeState === 'confirmed' ? <p className="small">{t('console.spike.isConfirmed')}</p> : null}
              {editable && r.spikeState !== 'confirmed' ? <SpikeActions submit={(body) => act('spike', 'POST', body)} /> : null}
            </section>
          ) : null}
          {editable ? (
            <section className="panel stack" aria-labelledby="actions-title">
              <h2 id="actions-title">{t('console.actions.title')}</h2>
              <StatusForm current={r.status} submit={(body) => act('status', 'PATCH', body)} />
              <OverrideForm override={r.override} submit={(body) => act('override', 'PUT', body)} />
              <ForwardSection report={r} submit={(body) => act('forward', 'POST', body)} />
              <MergeSection report={r} submit={(body) => act('merge', 'POST', body)} onMerged={(into) => router.push(consoleReportPath(into))} />
            </section>
          ) : (
            <p className="notice small">{t(r.editable ? 'console.report.readOnlyRole' : 'console.report.readOnly')}</p>
          )}
        </div>
      </div>
    </article>
  );
}

function Photos({ report: r }: { report: StaffReportDetail }) {
  const { t } = useI18n();
  if (r.photos.length === 0) return <p className="muted">{t('console.report.noPhotos')}</p>;
  return (
    <ul className="photos staff-photos">
      {r.photos.map((p, i) => (
        <li key={p.blurredUrl ?? p.originalUrl ?? i}>
          {p.blurredUrl ? (
            // Photos come from storage URLs the API signs; next/image would proxy them.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.blurredUrl} alt={t('console.report.photoAlt', { n: i + 1, total: r.photos.length, category: categoryLabel(t, r.category) })} loading="lazy" />
          ) : (
            <p className="small muted">{t('console.report.blurPending')}</p>
          )}
          {p.originalUrl ? (
            <a href={p.originalUrl} target="_blank" rel="noopener noreferrer" className="small">
              {t('console.report.original', { n: i + 1 })}
              <span className="visually-hidden"> {t('console.report.newTab')}</span>
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Facts({ report: r }: { report: StaffReportDetail }) {
  const { t, locale } = useI18n();
  return (
    <section aria-labelledby="facts-title">
      <h2 id="facts-title" className="visually-hidden">
        {t('console.report.facts')}
      </h2>
      {r.description ? <p className="card-desc">{r.description}</p> : <p className="muted">{t('console.report.noDescription')}</p>}
      <dl className="facts small">
        <dt>{t('console.queue.tenant')}</dt>
        <dd>{r.tenant.name}</dd>
        {r.createdAt ? (
          <>
            <dt>{t('detail.reported')}</dt>
            <dd>{formatDateTime(locale, r.createdAt)}</dd>
          </>
        ) : null}
        {r.capture?.at ? (
          <>
            <dt>{t('console.report.capturedAt')}</dt>
            <dd>{formatDateTime(locale, r.capture.at)}</dd>
          </>
        ) : null}
        {r.capture?.accuracyM !== null && r.capture?.accuracyM !== undefined ? (
          <>
            <dt>{t('console.report.accuracy')}</dt>
            <dd>± {formatNumber(locale, Math.round(r.capture.accuracyM))} m</dd>
          </>
        ) : null}
        {r.capture?.lat !== null && r.capture?.lat !== undefined && r.capture.lon !== null ? (
          <>
            <dt>{t('console.report.capturePosition')}</dt>
            <dd>{t('pin.coords', { lat: r.capture.lat.toFixed(5), lon: r.capture.lon.toFixed(5) })}</dd>
          </>
        ) : null}
        <dt>{t('console.report.engagement')}</dt>
        <dd>{t('console.queue.counts', { coReporters: r.counts.coReporters, comments: r.counts.comments, meToo: r.meTooCount ?? r.counts.meToo })}</dd>
      </dl>
    </section>
  );
}

function History({ entries }: { entries: HistoryEntry[] }) {
  const { t, locale } = useI18n();
  const describe = (e: HistoryEntry) => {
    const kind = HISTORY_KINDS.has(e.kind) ? e.kind : 'other';
    if (kind === 'override' && !e.to) return t('console.history.overrideCleared');
    if (kind === 'merge') return `${t('console.history.merge')}: ${e.from ?? ''} → ${e.to ?? ''}`;
    const to = e.to ? (e.kind === 'level' || e.kind === 'override' ? levelOrStatus(t, e.to) : statusLabel(t, e.to)) : '';
    return t(`console.history.${kind}` as MessageKey, { to });
  };
  return (
    <section aria-labelledby="history-title">
      <h2 id="history-title">{t('console.history.title')}</h2>
      {entries.length === 0 ? (
        <p className="muted">{t('console.history.empty')}</p>
      ) : (
        <ol className="history">
          {entries.map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <span className="small muted">{e.at ? formatDateTime(locale, e.at) : ''}</span> <span>{describe(e)}</span>
              {e.by ? <span className="small muted"> · {e.by}</span> : null}
              {e.note ? <p className="small">{t('console.history.note', { note: e.note })}</p> : null}
              {e.reason ? <p className="small">{t('console.history.reason', { reason: e.reason })}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function levelOrStatus(t: ReturnType<typeof useI18n>['t'], value: string): string {
  const level = ['critical', 'high', 'medium', 'low'].find((l) => l === value.toLowerCase());
  return level ? levelLabel(t, (level[0]!.toUpperCase() + level.slice(1)) as Parameters<typeof levelLabel>[1]) : value === 'null' ? t('console.override.useScore') : value;
}

function ForwardSection({ report: r, submit }: { report: StaffReportDetail; submit: Parameters<typeof ForwardForm>[0]['submit'] }) {
  const tenants = useStaffTenants();
  const tenantId = r.tenant.id;
  const contacts = useQuery({
    queryKey: ['staff', 'contacts', tenantId],
    queryFn: async () => normalizeContacts(await apiOrThrow<unknown>(`staff/tenants/${tenantId}/contacts`)),
    enabled: !r.forwardTargets && !!tenantId,
    retry: false,
  });
  const ownType = tenants.data?.find((x) => x.id === tenantId)?.type;
  // The API lists parent and sibling tenants together; with the report tenant's type they split exactly.
  const fromApi = r.forwardTargets && ownType ? { ...r.forwardTargets, ...splitForwardTenants([...r.forwardTargets.parents, ...r.forwardTargets.siblings], ownType) } : r.forwardTargets;
  const targets = fromApi ?? forwardTargetsFrom(tenants.data ?? [], tenantId, contacts.data ?? []);
  return <ForwardForm targets={targets} submit={submit} />;
}

function MergeSection({ report: r, submit, onMerged }: { report: StaffReportDetail; submit: Parameters<typeof MergeForm>[0]['submit']; onMerged: (into: string) => void }) {
  const qs = new URLSearchParams({ sort: 'score', limit: '50' });
  if (r.tenant.id) qs.set('tenantId', r.tenant.id);
  const query = qs.toString();
  const candidates = useQuery({ queryKey: ['staff', 'reports', query], queryFn: async () => normalizeQueue(await apiOrThrow<unknown>(`staff/reports?${query}`)) });
  const ids = (candidates.data?.reports ?? []).filter((x) => x.editable).map((x) => x.publicId);
  return <MergeForm publicId={r.publicId} candidates={ids} submit={submit} onMerged={onMerged} />;
}
