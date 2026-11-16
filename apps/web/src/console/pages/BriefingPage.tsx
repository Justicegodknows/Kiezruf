'use client';

// Weekly briefing (US-53, US-54, US-43): the console's landing page, the first thing staff see on Monday. One
// briefing per tenant and roll-up node in scope, at most 5 items (Urgent, Watch, Improving), each citing its
// reports. Labelled as AI-written, staff decide; a fallback without AI says so. Every item can be rated
// "Useful" / "Something is wrong" with an optional note. The last 8 weeks can be opened.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useId, useState, type FormEvent } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { categoryLabel } from '@/components/labels';
import { formatDateTime, intlLocale, type MessageKey } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { apiOrThrow } from '@/lib/api-client';
import { consoleReportPath } from '@/lib/console-paths';
import { isCategoryKey, normalizeBriefings, weekNumber, type Briefing, type BriefingItem, type BriefingKind } from '../analysis';
import { TenantPicker, useAnalysisScope } from '../components/AnalysisScope';
import { LevelChip } from '../components/LevelChip';
import { useStaff } from '../StaffProvider';

export const MAX_RATING_NOTE_LENGTH = 500;

const KIND_SHAPES: Record<BriefingKind, string> = { Urgent: '!', Watch: '◉', Improving: '↘' };

export function briefingsKey(tenantId: string) {
  return ['staff', 'briefings', tenantId] as const;
}

/** "Week 45 · from 9 Nov 2026" for a briefing's Monday. */
function weekTitle(t: ReturnType<typeof useI18n>['t'], locale: ReturnType<typeof useI18n>['locale'], weekStart: string | null): string {
  if (!weekStart) return t('console.briefing.weekUnknown');
  const week = weekNumber(weekStart);
  const day = new Date(`${weekStart.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return weekStart;
  const date = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', timeZone: 'UTC' }).format(day);
  return week === null ? date : t('console.briefing.week', { week, date });
}

export function BriefingPage() {
  const { t } = useI18n();
  const scope = useAnalysisScope();
  const tenantId = scope.tenantId;
  const briefings = useQuery({
    queryKey: briefingsKey(tenantId),
    queryFn: async () => normalizeBriefings(await apiOrThrow<unknown>(tenantId ? `staff/briefings?tenantId=${encodeURIComponent(tenantId)}` : 'staff/briefings')),
    enabled: !scope.loading,
  });
  const [weekPick, setWeekPick] = useState<{ tenantId: string; id: string } | null>(null);
  const weekId = useId();
  const list = briefings.data ?? [];
  // The newest week unless an older one was picked for this tenant.
  const current = list.find((b) => weekPick?.tenantId === tenantId && b.id === weekPick.id) ?? list[0];
  const name = scope.tenant?.name ?? current?.tenant.name ?? '';

  return (
    <div className="console-page stack">
      <div className="row page-head">
        <h1 className="grow">{name ? t('console.briefing.titleFor', { tenant: name }) : t('console.briefing.title')}</h1>
      </div>
      <div className="row analysis-controls">
        <TenantPicker scope={scope} />
        {list.length > 1 ? (
          <div className="field">
            <label htmlFor={weekId}>{t('console.briefing.weekLabel')}</label>
            <BriefingWeekSelect id={weekId} briefings={list} value={current?.id ?? ''} onChange={(id) => setWeekPick({ tenantId, id })} />
          </div>
        ) : null}
      </div>
      {scope.loading || briefings.isPending ? <p role="status">{t('common.loading')}</p> : null}
      {briefings.isError ? <ErrorText code={(briefings.error as { code?: string }).code ?? 'unknown'} /> : null}
      {briefings.data && !current ? (
        <div className="notice info">
          <p>
            <strong>{t('console.briefing.none')}</strong>
          </p>
          <p className="small">{t('console.briefing.noneExplain')}</p>
          <p className="small">
            <Link href="/console/queue">{t('console.briefing.toQueue')}</Link>
          </p>
        </div>
      ) : null}
      {current ? <BriefingView key={current.id} briefing={current} tenantId={tenantId} /> : null}
    </div>
  );
}

function BriefingWeekSelect({ id, briefings, value, onChange }: { id: string; briefings: Briefing[]; value: string; onChange: (id: string) => void }) {
  const { t, locale } = useI18n();
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {briefings.map((b, i) => (
        <option key={b.id} value={b.id}>
          {weekTitle(t, locale, b.weekStart)}
          {i === 0 ? ` (${t('console.briefing.latest')})` : ''}
          {b.fallback ? ` · ${t('console.briefing.fallbackShort')}` : ''}
        </option>
      ))}
    </select>
  );
}

export function BriefingView({ briefing: b, tenantId }: { briefing: Briefing; tenantId: string }) {
  const { t, locale } = useI18n();
  return (
    <section className="stack" aria-labelledby={`briefing-${b.id}`}>
      <div>
        <h2 id={`briefing-${b.id}`}>{weekTitle(t, locale, b.weekStart)}</h2>
        {b.generatedAt ? <p className="small muted">{t('console.briefing.generatedAt', { at: formatDateTime(locale, b.generatedAt) })}</p> : null}
      </div>
      {b.fallback ? (
        <div className="notice ai-note fallback-note" data-testid="briefing-label">
          <p>
            <strong>
              <span aria-hidden="true">ⓘ </span>
              {t('console.briefing.fallbackLabel')}
            </strong>
          </p>
          <p className="small">{t('console.briefing.fallbackExplain')}</p>
        </div>
      ) : (
        <div className="notice ai-note" data-testid="briefing-label">
          <p>
            <strong>
              <span aria-hidden="true">✦ </span>
              {b.aiWritten ? t('console.briefing.aiLabel') : t('console.briefing.notAiLabel')}
            </strong>
          </p>
          <p className="small">{t('console.briefing.aiExplain')}</p>
        </div>
      )}
      {b.items.length === 0 ? <p className="muted">{t('console.briefing.noItems')}</p> : null}
      <ol className="plain-list briefing-items">
        {b.items.map((item) => (
          <li key={item.id}>
            <BriefingItemView item={item} fallback={b.fallback} tenantId={tenantId} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function BriefingItemView({ item, fallback, tenantId }: { item: BriefingItem; fallback: boolean; tenantId: string }) {
  const { t } = useI18n();
  const headingId = useId();
  // The fallback writes a report ID as headline and the category key as text.
  const text = fallback && isCategoryKey(item.text) ? categoryLabel(t, item.text) : item.text;
  return (
    <article className="panel briefing-item stack-sm" aria-labelledby={headingId}>
      <div className="row">
        <LevelChip level={item.level} />
        <span className={`tag kind kind-${item.kind.toLowerCase()}`}>
          <span aria-hidden="true">{KIND_SHAPES[item.kind]} </span>
          {t(`console.briefing.kind.${item.kind}` as MessageKey)}
        </span>
      </div>
      <h3 id={headingId}>{item.headline}</h3>
      {text ? <p>{text}</p> : null}
      {item.citations.length > 0 ? (
        <div className="citations">
          <span className="small">{t('console.briefing.citations')}</span>{' '}
          <ul className="inline-list">
            {item.citations.map((id) => (
              <li key={id}>
                <Link href={consoleReportPath(id)} className="cite mono">
                  {id}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <RatingForm item={item} tenantId={tenantId} />
    </article>
  );
}

/** "Useful" / "Something is wrong" with an optional note (US-54). Sending again replaces the earlier rating. */
export function RatingForm({ item, tenantId }: { item: BriefingItem; tenantId: string }) {
  const { t } = useI18n();
  const { call } = useStaff();
  const queryClient = useQueryClient();
  const noteId = useId();
  const groupId = useId();
  const [choice, setChoice] = useState<boolean | null>(item.myRating?.useful ?? null);
  const [note, setNote] = useState(item.myRating?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (choice === null) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const trimmed = note.trim();
    const result = await call(`staff/briefings/items/${item.id}/rating`, { method: 'POST', body: { useful: choice, ...(trimmed ? { note: trimmed } : {}) } });
    setBusy(false);
    if (!result.ok) {
      setError(String(result.error));
      return;
    }
    setSaved(true);
    await queryClient.invalidateQueries({ queryKey: briefingsKey(tenantId) });
  }

  const label = (useful: boolean) => (useful ? t('console.briefing.useful') : t('console.briefing.wrong'));
  return (
    <form className="rating stack-sm" onSubmit={submit} aria-labelledby={groupId}>
      <p id={groupId} className="small">
        {item.myRating ? t('console.briefing.yourRating', { rating: label(item.myRating.useful) }) : t('console.briefing.rateThis')}
      </p>
      <div className="row" role="group" aria-labelledby={groupId}>
        {[true, false].map((useful) => (
          <button key={String(useful)} type="button" className="btn sm" aria-pressed={choice === useful} onClick={() => setChoice(useful)}>
            {label(useful)}
          </button>
        ))}
      </div>
      {choice !== null ? (
        <>
          <div className="field">
            <label htmlFor={noteId}>{t('console.briefing.note')}</label>
            <textarea id={noteId} rows={2} maxLength={MAX_RATING_NOTE_LENGTH} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div>
            <button type="submit" className="btn primary sm" disabled={busy}>
              {busy ? t('common.sending') : t('console.briefing.sendRating')}
            </button>
          </div>
        </>
      ) : null}
      <ErrorText code={error} />
      {saved ? (
        <p role="status" className="success small">
          {t('console.briefing.ratingSaved')}
        </p>
      ) : null}
    </form>
  );
}
