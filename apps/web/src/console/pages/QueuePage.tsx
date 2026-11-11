'use client';

// Priority queue (US-25, US-22, US-23, US-24, US-43): sorted by score unless staff pick age. Filters for category,
// level, status, tenant and age live in the URL, so the queue comes back as it was after opening a report.
// With several tenants in scope (roll-up for Berlin-level viewers) the table gets a tenant column.
import { CATEGORIES } from '@kiezruf/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId, useMemo } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { categoryLabel, statusLabel } from '@/components/labels';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime, type MessageKey } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { apiOrThrow } from '@/lib/api-client';
import { consoleReportPath } from '@/lib/console-paths';
import { ALL_STATUSES } from '@/lib/paths';
import { LevelChip } from '../components/LevelChip';
import { ScopeBreadcrumb } from '../components/ScopeBreadcrumb';
import { ageHoursSince, formatAge, formatScore, levelLabel } from '../format';
import { grantsCovering } from '../permissions';
import { useStaff } from '../StaffProvider';
import { flattenTree, roots } from '../tenants';
import { LEVELS, normalizeQueue, normalizeTenants, type StaffTenant } from '../types';

export const PAGE_SIZE = 50;
export const AGE_OPTIONS = [1, 7, 30, 90] as const;
const FILTER_KEYS = ['category', 'level', 'status', 'tenantId', 'maxAgeDays', 'sort'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
export type QueueFilters = Record<FilterKey, string> & { offset: number };

export function filtersFrom(params: URLSearchParams): QueueFilters {
  const get = (k: string) => (params.get(k) ?? '').slice(0, 64);
  const offset = Number(params.get('offset') ?? 0);
  return {
    category: get('category'),
    level: get('level'),
    status: get('status'),
    tenantId: get('tenantId'),
    maxAgeDays: get('maxAgeDays'),
    sort: get('sort') === 'age' ? 'age' : '',
    offset: Number.isInteger(offset) && offset > 0 ? offset : 0,
  };
}

/** The API query for the filters: empty filters are left out, the sort defaults to score. */
export function queueQuery(f: QueueFilters): string {
  const qs = new URLSearchParams();
  for (const key of FILTER_KEYS) if (f[key]) qs.set(key, f[key]);
  if (!qs.has('sort')) qs.set('sort', 'score');
  qs.set('limit', String(PAGE_SIZE));
  if (f.offset) qs.set('offset', String(f.offset));
  return qs.toString();
}

export function useStaffTenants() {
  return useQuery({ queryKey: ['staff', 'tenants'], queryFn: async () => normalizeTenants(await apiOrThrow<unknown>('staff/tenants')) });
}

export function QueuePage() {
  const { t, tp, locale } = useI18n();
  const { me } = useStaff();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = useMemo(() => filtersFrom(new URLSearchParams(params.toString())), [params]);
  const query = queueQuery(filters);
  const tenants = useStaffTenants();
  const queue = useQuery({ queryKey: ['staff', 'reports', query], queryFn: async () => normalizeQueue(await apiOrThrow<unknown>(`staff/reports?${query}`)) });
  const ids = { category: useId(), level: useId(), status: useId(), tenant: useId(), age: useId(), sort: useId(), heading: useId() };

  const tenantList = tenants.data ?? [];
  const rows = queue.data?.reports ?? [];
  const multiTenant = tenantList.length > 1 || new Set(rows.map((r) => r.tenant.id || r.tenant.name)).size > 1;
  const scopeRoot: StaffTenant | undefined = filters.tenantId ? tenantList.find((x) => x.id === filters.tenantId) : roots(tenantList)[0];

  function update(patch: Partial<QueueFilters>) {
    const next = { ...filters, offset: 0, ...patch };
    const qs = new URLSearchParams();
    for (const key of FILTER_KEYS) if (next[key]) qs.set(key, next[key]);
    if (next.offset) qs.set('offset', String(next.offset));
    const s = qs.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  const select = (key: FilterKey, id: string, label: MessageKey, options: { value: string; label: string }[], allLabel: MessageKey = 'filters.all') => (
    <div className="field">
      <label htmlFor={id}>{t(label)}</label>
      <select id={id} value={filters[key]} onChange={(e) => update({ [key]: e.target.value })}>
        {allLabel ? <option value="">{t(allLabel)}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="console-page">
      <div className="row page-head">
        <h1 id={ids.heading} className="grow">
          {t('console.queue.title')}
        </h1>
        {queue.data ? (
          <p className="small muted" role="status">
            {tp(filters.sort === 'age' ? 'console.queue.countByAge' : 'console.queue.countByScore', rows.length)}
          </p>
        ) : null}
      </div>
      {multiTenant && scopeRoot ? (
        <ScopeBreadcrumb tenants={tenantList} current={scopeRoot} me={me} onSelect={(tenant) => update({ tenantId: roots(tenantList)[0]?.id === tenant.id ? '' : tenant.id })} />
      ) : null}
      <form className="filters console-filters" aria-label={t('filters.label')} onSubmit={(e) => e.preventDefault()}>
        <div className="field">
          <label htmlFor={ids.category}>{t('filters.category')}</label>
          <select id={ids.category} value={filters.category} onChange={(e) => update({ category: e.target.value })}>
            <option value="">{t('filters.all')}</option>
            {(['traffic', 'community'] as const).map((group) => (
              <optgroup key={group} label={t(`group.${group}`)}>
                {CATEGORIES.filter((c) => c.group === group).map((c) => (
                  <option key={c.key} value={c.key}>
                    {categoryLabel(t, c.key)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        {select(
          'level',
          ids.level,
          'console.queue.level',
          LEVELS.map((l) => ({ value: l, label: levelLabel(t, l) })),
        )}
        {select(
          'status',
          ids.status,
          'filters.status',
          [...ALL_STATUSES.map((s) => ({ value: s as string, label: statusLabel(t, s) })), { value: 'all', label: t('console.queue.allStatuses') }],
          'console.queue.activeStatuses',
        )}
        {multiTenant
          ? select(
              'tenantId',
              ids.tenant,
              'console.queue.tenant',
              flattenTree(tenantList)
                .filter(({ tenant }) => grantsCovering(me, tenant.path).length > 0 || !me)
                .map(({ tenant, level }) => ({ value: tenant.id, label: `${'  '.repeat(level)}${tenant.name}` })),
              'console.queue.allTenants',
            )
          : null}
        {select(
          'maxAgeDays',
          ids.age,
          'filters.age',
          AGE_OPTIONS.map((d) => ({ value: String(d), label: tp('filters.days', d) })),
          'filters.anyAge',
        )}
        <div className="field">
          <label htmlFor={ids.sort}>{t('console.queue.sort')}</label>
          <select id={ids.sort} value={filters.sort} onChange={(e) => update({ sort: e.target.value })}>
            <option value="">{t('console.queue.sortScore')}</option>
            <option value="age">{t('console.queue.sortAge')}</option>
          </select>
        </div>
      </form>

      {queue.isPending ? <p role="status">{t('common.loading')}</p> : null}
      {queue.isError ? <ErrorText code={(queue.error as { code?: string }).code ?? 'unknown'} /> : null}
      {queue.data && rows.length === 0 ? <p>{t('console.queue.empty')}</p> : null}
      {rows.length > 0 ? (
        <div className="table-wrap" role="region" aria-labelledby={ids.heading} tabIndex={0}>
          <table className="queue-table">
            <caption className="visually-hidden">{filters.sort === 'age' ? t('console.queue.captionAge') : t('console.queue.captionScore')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('console.queue.level')}</th>
                <th scope="col">{t('console.queue.report')}</th>
                {multiTenant ? <th scope="col">{t('console.queue.tenant')}</th> : null}
                <th scope="col">{t('filters.status')}</th>
                <th scope="col" aria-sort={filters.sort === 'age' ? 'descending' : undefined}>
                  {t('filters.age')}
                </th>
                <th scope="col" className="num" aria-sort={filters.sort === 'age' ? undefined : 'descending'}>
                  {t('console.queue.score')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const age = ageHoursSince(r.createdAt);
                return (
                  <tr key={r.publicId}>
                    <td>
                      <LevelChip level={r.level} override={r.override} />
                      {r.levelChangedAt ? <div className="small muted">{t('console.queue.levelSince', { at: formatDateTime(locale, r.levelChangedAt) })}</div> : null}
                    </td>
                    <td>
                      <Link href={consoleReportPath(r.publicId)} className="row-link">
                        {categoryLabel(t, r.category)}
                        <span className="visually-hidden">, </span> <span className="mono small">{r.publicId}</span>
                      </Link>
                      <div className="row small">
                        {r.spike ? <span className="tag flag">{t('console.marker.spike')}</span> : null}
                        {!r.editable ? <span className="tag">{t('console.marker.readOnly')}</span> : null}
                        <span className="muted">
                          {t('console.queue.counts', { coReporters: r.counts.coReporters, comments: r.counts.comments, meToo: r.counts.meToo })}
                        </span>
                      </div>
                    </td>
                    {multiTenant ? <td>{r.tenant.name}</td> : null}
                    <td>
                      <StatusBadge status={r.status} label={statusLabel(t, r.status)} />
                    </td>
                    <td className="small">{age === null ? '' : formatAge(t, locale, age)}</td>
                    <td className="num mono">{formatScore(locale, r.score)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {queue.data && (filters.offset > 0 || rows.length === PAGE_SIZE) ? (
        <nav className="row pager" aria-label={t('console.queue.pages')}>
          <button type="button" className="btn sm" disabled={filters.offset === 0} onClick={() => update({ offset: Math.max(0, filters.offset - PAGE_SIZE) })}>
            {t('console.queue.previous')}
          </button>
          <span className="small">{t('console.queue.page', { page: Math.floor(filters.offset / PAGE_SIZE) + 1 })}</span>
          <button type="button" className="btn sm" disabled={rows.length < PAGE_SIZE} onClick={() => update({ offset: filters.offset + PAGE_SIZE })}>
            {t('console.queue.next')}
          </button>
        </nav>
      ) : null}
    </div>
  );
}
