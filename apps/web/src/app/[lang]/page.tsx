import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon, type IconName } from '@/components/Icon';
import { ReportExplorer, type ReportListItem } from '@/components/ReportExplorer';
import { hasLocale } from '@/i18n/config';
import { formatAge, formatDistance, formatNumber } from '@/i18n/format';
import { getDictionary } from '@/i18n/get-dictionary';
import { listPublicReports } from '@/lib/sample-data';

export default async function HomePage({ params }: PageProps<'/[lang]'>) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);

  // Citizen view: status, Me too and co-reporters only; never score or level (US-24).
  const reports: ReportListItem[] = listPublicReports().map((r) => ({
    id: r.id,
    href: `/${lang}/reports/${r.id}`,
    title: r.title[lang],
    category: r.category,
    categoryLabel: t.categories[r.category],
    subcategoryLabel: t.subcategories[r.subcategory],
    place: r.place,
    distance: formatDistance(r.distanceMetres, lang),
    age: formatAge(r.ageHours, lang),
    status: r.status,
    statusLabel: t.status[r.status],
    meTooLabel: String(r.meToo),
    commentsLabel: String(r.comments.length),
    safety: r.safetyCategory,
    x: r.x,
    y: r.y,
  }));

  const steps: { key: keyof typeof t.home.steps; icon: IconName }[] = [
    { key: 'photo', icon: 'camera' },
    { key: 'locate', icon: 'pin' },
    { key: 'follow', icon: 'bell' },
  ];

  return (
    <>
      <section className="hero">
        <div className="container hero__inner">
          <div className="hero__copy">
            <p className="eyebrow eyebrow--pill">
              <Icon name="sparkle" size={14} />
              {t.home.eyebrow}
            </p>
            <h1 className="display">{t.home.title}</h1>
            <p className="lead">{t.home.lead}</p>
            <div className="hero__actions">
              <a href="#nearby" className="button button--primary button--lg">
                <Icon name="pin" size={20} />
                {t.home.ctaBrowse}
              </a>
              <Link href={`/${lang}/console`} className="button button--secondary button--lg">
                {t.home.ctaConsole}
                <Icon name="arrowRight" size={18} />
              </Link>
            </div>
          </div>
          <dl className="hero__stats" aria-label={t.home.statsLabel}>
            <div className="stat">
              <dt>{t.home.statOpen}</dt>
              <dd>{formatNumber(101, lang)}</dd>
            </div>
            <div className="stat">
              <dt>{t.home.statResolved}</dt>
              <dd>{formatNumber(214, lang)}</dd>
            </div>
            <div className="stat">
              <dt>{t.home.statResponse}</dt>
              <dd>{t.home.statResponseValue}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="section" aria-labelledby="steps-title">
        <div className="container">
          <h2 id="steps-title" className="section__title">
            {t.home.stepsTitle}
          </h2>
          <ol className="steps">
            {steps.map((step, i) => (
              <li key={step.key} className="step card">
                <span className="step__icon">
                  <Icon name={step.icon} size={22} />
                </span>
                <span className="step__number mono">0{i + 1}</span>
                <h3>{t.home.steps[step.key].title}</h3>
                <p>{t.home.steps[step.key].body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section--sunk" id="nearby" aria-labelledby="nearby-title">
        <div className="container">
          <div className="section__head">
            <div>
              <h2 id="nearby-title" className="section__title">
                {t.home.nearbyTitle}
              </h2>
              <p className="muted">{t.home.nearbySubtitle}</p>
            </div>
            <p className="notice">
              <Icon name="lock" size={16} />
              {t.home.guestNote}
            </p>
          </div>
          <ReportExplorer
            reports={reports}
            t={{
              filterLabel: t.home.filterLabel,
              filterAll: t.home.filterAll,
              mapLabel: t.home.mapLabel,
              mapLegend: t.home.mapLegend,
              emptyFilter: t.home.emptyFilter,
              resultCount: t.home.resultCount,
              safetyHint: t.report.safetyHint,
              categories: t.categories,
            }}
          />
        </div>
      </section>
    </>
  );
}
