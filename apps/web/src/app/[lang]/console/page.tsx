import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CategoryBars } from '@/components/console/CategoryBars';
import { QueuePanel, type QueueRow } from '@/components/console/QueuePanel';
import { TrendChart } from '@/components/console/TrendChart';
import { Icon, type IconName } from '@/components/Icon';
import { hasLocale } from '@/i18n/config';
import { fill, formatAge, formatNumber } from '@/i18n/format';
import { getDictionary } from '@/i18n/get-dictionary';
import { OPEN_BY_SUBCATEGORY, WEEKLY_TREND, listStaffQueue } from '@/lib/sample-data';

export async function generateMetadata({ params }: PageProps<'/[lang]/console'>): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const t = await getDictionary(lang);
  return { title: t.console.title };
}

export default async function ConsolePage({ params }: PageProps<'/[lang]/console'>) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  const n = (v: number, digits = 0) => formatNumber(v, lang, digits);

  const queue = listStaffQueue();
  const rows: QueueRow[] = queue.map((r) => ({
    id: r.id,
    title: r.title[lang],
    place: r.place,
    subcategoryLabel: t.subcategories[r.subcategory],
    level: r.level,
    levelLabel: t.levels[r.level],
    score: n(r.score, 1),
    status: r.status,
    statusLabel: t.status[r.status],
    age: formatAge(r.ageHours, lang),
    breakdown: {
      coReporters: `${r.coReporters} × 5 = ${r.breakdown.coReporterPoints}`,
      commenters: `${r.commenters} × 2 = ${r.breakdown.commenterPoints}`,
      meToo: `${r.meToo} × 1 = ${r.breakdown.meTooPoints}`,
      base: n(r.breakdown.base),
      decay: n(r.breakdown.decay, 3),
      danger: n(r.breakdown.danger, 1),
      safety: n(r.breakdown.safety, 1),
      score: n(r.score, 1),
    },
    points: {
      coReporters: r.breakdown.coReporterPoints,
      commenters: r.breakdown.commenterPoints,
      meToo: r.breakdown.meTooPoints,
    },
  }));

  const kpis: { label: string; value: string; delta?: string; trend?: 'up' | 'down'; icon: IconName; tone?: string }[] = [
    { label: t.console.kpiOpen, value: n(101), delta: fill(t.console.deltaUp, { value: 7 }), trend: 'up', icon: 'inbox' },
    {
      label: t.console.kpiCritical,
      value: n(queue.filter((r) => r.level === 'Critical').length),
      icon: 'alert',
      tone: 'critical',
    },
    { label: t.console.kpiAck, value: t.console.kpiAckValue, delta: fill(t.console.deltaDown, { value: '3 h' }), trend: 'down', icon: 'clock' },
    { label: t.console.kpiResolved, value: n(54), delta: fill(t.console.deltaUp, { value: 2 }), trend: 'up', icon: 'check' },
  ];

  return (
    <div className="container page console">
      <header className="console__header">
        <div>
          <nav aria-label={t.console.scopeLabel} className="breadcrumb">
            <ol>
              <li>{t.console.scopeBerlin}</li>
              <li aria-current="page">{t.console.scopeDistrict}</li>
            </ol>
          </nav>
          <h1 className="title-xl">{t.console.title}</h1>
          <p className="muted">{t.console.office}</p>
        </div>
      </header>

      {/* One strip divided by rules, not four separate cards. */}
      <dl aria-label={t.console.kpiLabel} className="kpis">
        {kpis.map((k) => (
          <div key={k.label} className="kpi" data-tone={k.tone}>
            <dt className="kpi__label">
              <Icon name={k.icon} size={16} />
              {k.label}
            </dt>
            <dd className="kpi__value">{k.value}</dd>
            {k.delta && <dd className="kpi__delta">{k.delta}</dd>}
          </div>
        ))}
      </dl>

      <div className="console__charts">
        <section className="card card--padded" aria-labelledby="trend-title">
          <h2 id="trend-title" className="title-sm">
            {t.console.trendTitle}
          </h2>
          <p className="muted small">{t.console.trendSubtitle}</p>
          <TrendChart
            data={WEEKLY_TREND.map((w) => ({
              label: fill(t.console.trendWeek, { week: w.week }),
              received: w.received,
              resolved: w.resolved,
            }))}
            receivedLabel={t.console.trendReceived}
            resolvedLabel={t.console.trendResolved}
            tableLabel={t.console.tableView}
            chartLabel={t.console.chartView}
            caption={`${t.console.trendTitle}: ${t.console.trendSubtitle}`}
          />
        </section>
        <section className="card card--padded" aria-labelledby="category-title">
          <h2 id="category-title" className="title-sm">
            {t.console.categoryTitle}
          </h2>
          <p className="muted small">{t.console.categorySubtitle}</p>
          <CategoryBars
            label={t.console.categoryTitle}
            items={OPEN_BY_SUBCATEGORY.map((c) => ({ label: t.subcategories[c.subcategory], count: c.count }))}
          />
        </section>
      </div>

      <section aria-labelledby="queue-title" className="console__queue">
        <header className="console__section-head">
          <h2 id="queue-title" className="title-md">
            {t.console.queueTitle}
          </h2>
          <p className="muted small">{t.console.queueSubtitle}</p>
        </header>
        <QueuePanel
          rows={rows}
          t={{
            colReport: t.console.colReport,
            colLevel: t.console.colLevel,
            colScore: t.console.colScore,
            colStatus: t.console.colStatus,
            colAge: t.console.colAge,
            breakdownTitle: t.console.breakdownTitle,
            basePoints: t.console.basePoints,
            coReportersTimes: t.console.coReportersTimes,
            commentersTimes: t.console.commentersTimes,
            meTooTimes: t.console.meTooTimes,
            decay: t.console.decay,
            decayHint: t.console.decayHint,
            danger: t.console.danger,
            safety: t.console.safety,
            total: t.console.total,
            staffOnly: t.console.staffOnly,
            reference: t.report.reference,
            place: t.report.location,
          }}
        />
      </section>
    </div>
  );
}
