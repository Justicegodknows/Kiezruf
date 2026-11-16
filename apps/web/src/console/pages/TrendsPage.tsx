'use client';

// Trends (US-51, US-55): reports per week and category for the last 8 weeks, the latest week against the average
// of the 4 weeks before it, and the median hours to acknowledge and to resolve. Small bar charts in plain SVG, all
// on the same scale so categories compare; the table below has every number for screen readers and keyboard use.
// The export for council meetings (US-55) sits at the end.
import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { categoryLabel } from '@/components/labels';
import { formatNumber, intlLocale, type Locale, type Translate } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { apiOrThrow } from '@/lib/api-client';
import { normalizeTrends, trendChange, weekNumber, type CategoryTrend, type TrendChange } from '../analysis';
import { TenantPicker, useAnalysisScope } from '../components/AnalysisScope';
import { ExportPanel } from '../components/ExportPanel';

export const TREND_WEEKS = 8;

export function weekLabel(t: Translate, label: string): string {
  const n = weekNumber(label);
  return n === null ? label : t('console.trends.weekShort', { week: n });
}

/** "+25 %", "−10 %", "±0 %", "new", or "–" when there is nothing to compare. */
export function formatChange(t: Translate, locale: Locale, change: TrendChange): string {
  if (change.direction === 'new') return t('console.trends.changeNew');
  if (change.percent === null) return '–';
  const abs = formatNumber(locale, Math.abs(change.percent));
  if (change.percent > 0) return `+${abs} %`;
  if (change.percent < 0) return `−${abs} %`;
  return `±0 %`;
}

/** "18 h" under two days, else "3.4 days". */
export function formatHours(t: Translate, locale: Locale, hours: number): string {
  if (hours < 48) return t('console.trends.hours', { count: formatNumber(locale, Math.round(hours)) });
  return t('console.trends.days', { count: new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(hours / 24) });
}

const ARROWS: Record<TrendChange['direction'], string> = { up: '▲', down: '▼', flat: '▬', new: '✚', none: '' };

export function TrendsPage() {
  const { t, locale } = useI18n();
  const scope = useAnalysisScope();
  const tenantId = scope.tenantId;
  const tableHeading = useId();
  const trends = useQuery({
    queryKey: ['staff', 'trends', tenantId],
    queryFn: async () => {
      const qs = new URLSearchParams({ weeks: String(TREND_WEEKS) });
      if (tenantId) qs.set('tenantId', tenantId);
      return normalizeTrends(await apiOrThrow<unknown>(`staff/trends?${qs.toString()}`));
    },
    enabled: !scope.loading,
  });
  const data = trends.data;
  const max = Math.max(4, ...(data?.categories.flatMap((c) => c.counts) ?? [0]));
  const scaleMax = Math.ceil(max / 4) * 4;

  return (
    <div className="console-page stack">
      <h1>{scope.tenant ? t('console.trends.titleFor', { tenant: scope.tenant.name }) : t('console.trends.title')}</h1>
      <TenantPicker scope={scope} />
      {scope.loading || trends.isPending ? <p role="status">{t('common.loading')}</p> : null}
      {trends.isError ? <ErrorText code={(trends.error as { code?: string }).code ?? 'unknown'} /> : null}
      {data ? (
        <>
          <dl className="kpis">
            <div className="kpi">
              <dt>{t('console.trends.medianAck')}</dt>
              <dd>{data.medianHoursToAcknowledge === null ? t('console.trends.noData') : formatHours(t, locale, data.medianHoursToAcknowledge)}</dd>
            </div>
            <div className="kpi">
              <dt>{t('console.trends.medianResolve')}</dt>
              <dd>{data.medianHoursToResolve === null ? t('console.trends.noData') : formatHours(t, locale, data.medianHoursToResolve)}</dd>
            </div>
          </dl>
          {data.categories.length === 0 ? (
            <p>{t('console.trends.empty')}</p>
          ) : (
            <>
              <p className="small muted">
                {t('console.trends.explain', {
                  from: data.weeks[0] ? weekLabel(t, data.weeks[0]) : '',
                  to: data.weeks.length ? weekLabel(t, data.weeks[data.weeks.length - 1]!) : '',
                })}
              </p>
              <div className="trend-grid" aria-hidden="true">
                {data.categories.map((c) => (
                  <TrendChart key={c.category} trend={c} weeks={data.weeks} max={scaleMax} />
                ))}
              </div>
              <section aria-labelledby={tableHeading}>
                <h2 id={tableHeading}>{t('console.trends.tableTitle')}</h2>
                <TrendTable trends={data.categories} weeks={data.weeks} />
              </section>
            </>
          )}
        </>
      ) : null}
      <ExportPanel tenantId={tenantId} tenantName={scope.tenant?.name ?? null} />
    </div>
  );
}

/** One category: bars per week, the latest dark with its value; the change as text with an arrow. */
function TrendChart({ trend, weeks, max }: { trend: CategoryTrend; weeks: string[]; max: number }) {
  const { t, locale } = useI18n();
  const change = trendChange(trend);
  const W = 280;
  const H = 120;
  const left = 24;
  const bottom = 18;
  const top = 16;
  const n = Math.max(1, trend.counts.length);
  const bw = (W - left - 4) / n;
  const y = (v: number) => H - bottom - (v / max) * (H - bottom - top);
  const ticks = [0, max / 2, max];
  return (
    <figure className="trend-chart">
      <figcaption className="row">
        <b className="grow small">{categoryLabel(t, trend.category)}</b>
        <span className={`small mono change change-${change.direction}`}>
          {ARROWS[change.direction] ? `${ARROWS[change.direction]} ` : ''}
          {formatChange(t, locale, change)}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" focusable="false">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={left} x2={W} y1={y(v)} y2={y(v)} className="grid" />
            <text x={left - 4} y={y(v) + 3} textAnchor="end">
              {formatNumber(locale, v)}
            </text>
          </g>
        ))}
        {trend.counts.map((v, i) => {
          const last = i === trend.counts.length - 1;
          return <rect key={i} x={left + i * bw + 2} y={y(v)} width={Math.max(1, bw - 4)} height={Math.max(0, H - bottom - y(v))} rx={2} className={last ? 'bar bar-latest' : 'bar'} />;
        })}
        {change.latest !== null ? (
          <text x={left + (n - 1) * bw + bw / 2} y={y(change.latest) - 4} textAnchor="middle" className="bar-value">
            {formatNumber(locale, change.latest)}
          </text>
        ) : null}
        {weeks.map((w, i) =>
          i % 2 === 1 || i === weeks.length - 1 ? (
            <text key={w + i} x={left + i * bw + bw / 2} y={H - 4} textAnchor="middle">
              {weekLabel(t, w)}
            </text>
          ) : null,
        )}
      </svg>
      {change.average !== null ? (
        <p className="small muted">{t('console.trends.vsAverage', { average: new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(change.average) })}</p>
      ) : null}
    </figure>
  );
}

export function TrendTable({ trends, weeks }: { trends: CategoryTrend[]; weeks: string[] }) {
  const { t, locale } = useI18n();
  const one = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 });
  return (
    <div className="table-wrap" role="region" aria-label={t('console.trends.tableTitle')} tabIndex={0}>
      <table className="queue-table trend-table">
        <caption className="visually-hidden">{t('console.trends.caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('filters.category')}</th>
            {weeks.map((w, i) => (
              <th key={w + i} scope="col" className="num">
                {weekLabel(t, w)}
              </th>
            ))}
            <th scope="col" className="num">
              {t('console.trends.average')}
            </th>
            <th scope="col" className="num">
              {t('console.trends.change')}
            </th>
          </tr>
        </thead>
        <tbody>
          {trends.map((c) => {
            const change = trendChange(c);
            return (
              <tr key={c.category}>
                <th scope="row">{categoryLabel(t, c.category)}</th>
                {weeks.map((w, i) => (
                  <td key={w + i} className="num mono">
                    {c.counts[i] === undefined ? '–' : formatNumber(locale, c.counts[i]!)}
                  </td>
                ))}
                <td className="num mono">{change.average === null ? '–' : one.format(change.average)}</td>
                <td className="num mono" data-testid={`change-${c.category}`}>
                  {formatChange(t, locale, change)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
