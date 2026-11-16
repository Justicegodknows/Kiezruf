'use client';

// "Browse & vote" (web prototype): list, map and detail side by side. No account needed (US-01).
// Nearest first, filters for category, status and age (US-15). The location is used only after "Near me".
import { CATEGORIES } from '@kiezruf/shared';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import type { MessageKey } from '@/i18n';
import { api, apiOrThrow, type PublicReport, type RouteAnswer } from '@/lib/api-client';
import { BERLIN_CENTER, currentFix, LocationError, type Point } from '@/lib/geo';
import { PUBLIC_STATUSES, reportIdFromSegment, reportPath } from '@/lib/paths';
import { ErrorText } from './ErrorText';
import { categoryLabel, statusLabel } from './labels';
import { NotLivePanel } from './NotLivePanel';
import { ReportCard } from './ReportCard';
import { ReportMap } from './ReportMap';

const AGE_OPTIONS = [1, 7, 30, 90] as const;
/** Radius around the Berlin centre covers most of the city; around the citizen, the neighbourhood. */
const CITY_RADIUS_M = 10_000;
const LOCAL_RADIUS_M = 3_000;

export interface Filters {
  category: string; // '' | 'group:traffic' | 'group:community' | category key
  status: string;
  maxAgeDays: string;
}

export function reportsQueryPath(center: Point, radiusM: number, filters: Filters): string {
  const q = new URLSearchParams({ lat: center.lat.toFixed(6), lon: center.lon.toFixed(6), radiusM: String(radiusM), limit: '100' });
  if (filters.category && !filters.category.startsWith('group:')) q.set('category', filters.category);
  if (filters.status) q.set('status', filters.status);
  if (filters.maxAgeDays) q.set('maxAgeDays', filters.maxAgeDays);
  return `public/reports?${q.toString()}`;
}

export function BrowseShell({ children }: { children: ReactNode }) {
  const { t, tp } = useI18n();
  const router = useRouter();
  const params = useParams<{ reportId?: string }>();
  const selectedId = params.reportId ? reportIdFromSegment(params.reportId) : null;
  const [center, setCenter] = useState<Point>(BERLIN_CENTER);
  const [nearMe, setNearMe] = useState(false);
  const [movedTo, setMovedTo] = useState<Point | null>(null);
  const [filters, setFilters] = useState<Filters>({ category: '', status: '', maxAgeDays: '' });
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [notLive, setNotLive] = useState<{ point: Point; tenant: string | null } | null>(null);
  const headingId = useId();
  const filterIds = { category: useId(), status: useId(), age: useId() };

  const radiusM = nearMe || center !== BERLIN_CENTER ? LOCAL_RADIUS_M : CITY_RADIUS_M;
  const path = reportsQueryPath(center, radiusM, filters);
  const query = useQuery({ queryKey: ['public-reports', path], queryFn: () => apiOrThrow<{ reports: PublicReport[] }>(path) });

  const reports = useMemo(() => {
    const all = query.data?.reports ?? [];
    if (!filters.category.startsWith('group:')) return all;
    const group = filters.category.slice('group:'.length);
    return all.filter((r) => CATEGORIES.find((c) => c.key === r.category)?.group === group);
  }, [query.data, filters.category]);

  async function locate() {
    setLocating(true);
    setLocationError(null);
    try {
      const fix = await currentFix();
      const point = { lat: fix.lat, lon: fix.lon };
      setCenter(point);
      setNearMe(true);
      setMovedTo(null);
      const route = await api<RouteAnswer>(`public/route?lat=${point.lat.toFixed(6)}&lon=${point.lon.toFixed(6)}`);
      setNotLive(route.ok && !route.data.live ? { point, tenant: route.data.tenant?.name ?? null } : null);
    } catch (err) {
      setLocationError(err instanceof LocationError ? err.code : 'location_unavailable');
    } finally {
      setLocating(false);
    }
  }

  const setFilter = (key: keyof Filters) => (value: string) => setFilters((f) => ({ ...f, [key]: value }));

  return (
    <div className={`browse${selectedId ? ' has-detail' : ''}`}>
      <section className="browse-list" aria-labelledby={headingId}>
        <h1 id={headingId}>{nearMe ? t('browse.titleNearMe') : t('browse.title')}</h1>
        <div className="toolbar">
          <button type="button" className="btn" onClick={locate} disabled={locating}>
            <span aria-hidden="true">◎ </span>
            {locating ? t('browse.locating') : t('browse.nearMe')}
          </button>
          {movedTo ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setCenter(movedTo);
                setMovedTo(null);
                setNearMe(false);
              }}
            >
              {t('browse.searchArea')}
            </button>
          ) : null}
        </div>
        <ErrorText code={locationError} />
        {notLive ? <NotLivePanel point={notLive.point} tenantName={notLive.tenant} /> : null}

        <form className="filters" aria-label={t('filters.label')} onSubmit={(e) => e.preventDefault()}>
          <div className="field">
            <label htmlFor={filterIds.category}>{t('filters.category')}</label>
            <select id={filterIds.category} value={filters.category} onChange={(e) => setFilter('category')(e.target.value)}>
              <option value="">{t('filters.all')}</option>
              {(['traffic', 'community'] as const).map((group) => (
                <optgroup key={group} label={t(`group.${group}` as MessageKey)}>
                  <option value={`group:${group}`}>{t('filters.allInGroup', { group: t(`group.${group}` as MessageKey) })}</option>
                  {CATEGORIES.filter((c) => c.group === group).map((c) => (
                    <option key={c.key} value={c.key}>
                      {categoryLabel(t, c.key)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={filterIds.status}>{t('filters.status')}</label>
            <select id={filterIds.status} value={filters.status} onChange={(e) => setFilter('status')(e.target.value)}>
              <option value="">{t('filters.all')}</option>
              {PUBLIC_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(t, s)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={filterIds.age}>{t('filters.age')}</label>
            <select id={filterIds.age} value={filters.maxAgeDays} onChange={(e) => setFilter('maxAgeDays')(e.target.value)}>
              <option value="">{t('filters.anyAge')}</option>
              {AGE_OPTIONS.map((d) => (
                <option key={d} value={String(d)}>
                  {tp('filters.days', d)}
                </option>
              ))}
            </select>
          </div>
        </form>

        <p role="status" className="small muted">
          {query.isPending ? t('common.loading') : query.isError ? '' : tp('browse.count', reports.length)}
        </p>
        {query.isError ? <ErrorText code={(query.error as { code?: string }).code ?? 'unknown'} /> : null}
        {!query.isPending && !query.isError && reports.length === 0 ? <p>{t('browse.empty')}</p> : null}
        <ol className="report-list">
          {reports.map((report) => (
            <li key={report.publicId}>
              <ReportCard report={report} selected={report.publicId === selectedId} />
            </li>
          ))}
        </ol>
      </section>

      <ReportMap
        reports={reports}
        selectedId={selectedId}
        center={center}
        onSelect={(report) => router.push(reportPath(report))}
        onMoved={setMovedTo}
      />

      <aside className="browse-detail" aria-label={t('detail.label')}>
        {children}
      </aside>
    </div>
  );
}
