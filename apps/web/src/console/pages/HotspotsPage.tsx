'use client';

// Hotspots (US-50, US-52, US-43): reports clustered within 150 m and the same category group, recomputed nightly.
// The map shows each cluster by its highest level (colour, shape and name) and its size; the table below holds
// the same data for keyboard and screen-reader use, with recurring places and their weekday pattern.
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useCallback, useId } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { formatDateTime, formatNumber, type MessageKey } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { apiOrThrow } from '@/lib/api-client';
import { consoleReportPath } from '@/lib/console-paths';
import { normalizeHotspots, type HotspotCluster } from '../analysis';
import { TenantPicker, useAnalysisScope } from '../components/AnalysisScope';
import { HotspotMap } from '../components/HotspotMap';
import { LevelChip } from '../components/LevelChip';

/** Report links per row before "and n more". */
const MAX_LINKS = 6;

export function groupName(t: ReturnType<typeof useI18n>['t'], group: string): string {
  return group === 'traffic' || group === 'community' ? t(`group.${group}`) : t('console.hotspots.groupUnknown');
}

export function HotspotsPage() {
  const { t, tp, locale } = useI18n();
  const scope = useAnalysisScope();
  const tenantId = scope.tenantId;
  const headingId = useId();
  const hotspots = useQuery({
    queryKey: ['staff', 'hotspots', tenantId],
    queryFn: async () => normalizeHotspots(await apiOrThrow<unknown>(tenantId ? `staff/hotspots?tenantId=${encodeURIComponent(tenantId)}` : 'staff/hotspots')),
    enabled: !scope.loading,
  });
  const clusters = hotspots.data?.clusters ?? [];
  const focusRow = useCallback((id: string) => {
    const row = document.getElementById(`cluster-${id}`);
    row?.scrollIntoView({ block: 'nearest' });
    row?.focus();
  }, []);

  return (
    <div className="console-page stack">
      <div className="row page-head">
        <h1 className="grow" id={headingId}>
          {scope.tenant ? t('console.hotspots.titleFor', { tenant: scope.tenant.name }) : t('console.hotspots.title')}
        </h1>
        {hotspots.data?.computedAt ? <p className="small muted">{t('console.hotspots.computedAt', { at: formatDateTime(locale, hotspots.data.computedAt) })}</p> : null}
      </div>
      <TenantPicker scope={scope} />
      <p className="small muted">{t('console.hotspots.explain')}</p>
      {scope.loading || hotspots.isPending ? <p role="status">{t('common.loading')}</p> : null}
      {hotspots.isError ? <ErrorText code={(hotspots.error as { code?: string }).code ?? 'unknown'} /> : null}
      {hotspots.data && clusters.length === 0 ? <p>{t('console.hotspots.empty')}</p> : null}
      {clusters.length > 0 ? (
        <>
          <HotspotMap clusters={clusters} onSelect={focusRow} />
          <p className="small" role="status">
            {tp('console.hotspots.count', clusters.length)}
          </p>
          <HotspotTable clusters={clusters} labelledBy={headingId} />
        </>
      ) : null}
    </div>
  );
}

export function HotspotTable({ clusters, labelledBy }: { clusters: HotspotCluster[]; labelledBy?: string }) {
  const { t, locale } = useI18n();
  return (
    <div className="table-wrap" role="region" aria-labelledby={labelledBy} tabIndex={0}>
      <table className="queue-table hotspot-table">
        <caption className="visually-hidden">{t('console.hotspots.caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('console.hotspots.level')}</th>
            <th scope="col">{t('console.hotspots.group')}</th>
            <th scope="col" className="num">
              {t('console.hotspots.reports')}
            </th>
            <th scope="col">{t('console.hotspots.recurring')}</th>
            <th scope="col">{t('console.hotspots.links')}</th>
          </tr>
        </thead>
        <tbody>
          {clusters.map((c) => (
            <tr key={c.id}>
              <th scope="row" id={`cluster-${c.id}`} tabIndex={-1} className="cluster-cell">
                <LevelChip level={c.level} />
              </th>
              <td>{groupName(t, c.group)}</td>
              <td className="num mono">{formatNumber(locale, c.count)}</td>
              <td>
                {c.recurring ? <span className="tag flag">{t('console.hotspots.isRecurring')}</span> : <span className="muted">{t('common.no')}</span>}
                {c.weekdayPattern ? <div className="small">{t(`console.hotspots.pattern.${c.weekdayPattern}` as MessageKey)}</div> : null}
              </td>
              <td>
                <ul className="inline-list">
                  {c.publicIds.slice(0, MAX_LINKS).map((id) => (
                    <li key={id}>
                      <Link href={consoleReportPath(id)} className="cite mono">
                        {id}
                      </Link>
                    </li>
                  ))}
                  {c.publicIds.length > MAX_LINKS ? <li className="small muted">{t('console.hotspots.more', { count: c.publicIds.length - MAX_LINKS })}</li> : null}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
