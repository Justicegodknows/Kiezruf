import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CategoryBars } from '@/components/charts/CategoryBars';
import { TrendChart } from '@/components/charts/TrendChart';
import { Icon, type IconName } from '@/components/Icon';
import { AppPreview } from '@/components/AppPreview';
import { Photo } from '@/components/Photo';
import { ReportExplorer, type ReportListItem } from '@/components/ReportExplorer';
import { hasLocale } from '@/i18n/config';
import { fill, formatAge, formatDistance, formatNumber } from '@/i18n/format';
import { getDictionary } from '@/i18n/get-dictionary';
import { OPEN_BY_SUBCATEGORY, PHOTOS, WEEKLY_TREND, listPublicReports } from '@kiezruf/shared';

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
    subcategoryLabel: t.subcategories[r.subcategory],
    place: r.place,
    distance: formatDistance(r.distanceMetres, lang),
    age: formatAge(r.ageHours, lang),
    status: r.status,
    statusLabel: t.status[r.status],
    meTooLabel: String(r.meToo),
    commentsLabel: String(r.comments.length),
    safety: r.safetyCategory,
    photo: r.photo,
    photoAlt: fill(t.report.photoAlt, { place: PHOTOS[r.photo].place }),
    x: r.x,
    y: r.y,
  }));

  const steps: { key: keyof typeof t.home.steps; icon: IconName }[] = [
    { key: 'photo', icon: 'camera' },
    { key: 'locate', icon: 'pin' },
    { key: 'follow', icon: 'bell' },
    { key: 'fixed', icon: 'check' },
  ];

  // The report made at the place in the photo band (the Rathaus on Karl-Marx-Straße).
  const spotlight = listPublicReports().find((r) => r.photo === 'rathaus');

  // Newest open reports for the street-sign plates in the hero.
  const plates = listPublicReports()
    .filter((r) => r.status !== 'resolved')
    .sort((a, b) => a.ageHours - b.ageHours)
    .slice(0, 3);

  return (
    <>
      <section className="hero">
        <div className="container hero__inner">
          <div className="hero__copy">
            <h1 className="display">{t.home.title}</h1>
            <p className="lead">{t.home.lead}</p>
            <div className="hero__actions">
              <a href="#nearby" className="button button--primary button--lg">
                <Icon name="pin" size={20} />
                {t.home.ctaBrowse}
              </a>
              <Link href={`/${lang}/console`} className="button button--quiet button--lg">
                {t.home.ctaConsole}
              </Link>
            </div>
          </div>

          {/* Signature element: what was just reported, as Berlin street-name plates. */}
          <div className="plates">
            <h2 className="plates__caption">{t.home.platesLabel}</h2>
            <ul className="plates__list">
              {plates.map((r) => (
                <li key={r.id}>
                  <Link href={`/${lang}/reports/${r.id}`} className="plate">
                    <span className="plate__district">{t.home.district}</span>
                    <span className="plate__street">{r.street}</span>
                    <span className="plate__issue">
                      {r.title[lang]}
                      <span className="plate__age">{formatAge(r.ageHours, lang)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="plates__figures">
              {fill(t.home.figures, {
                open: formatNumber(101, lang),
                resolved: formatNumber(214, lang),
                response: t.home.responseValue,
              })}
            </p>
          </div>
        </div>
      </section>

      {/* The place behind the product: the district office on Karl-Marx-Straße. */}
      {/* The street and the app side by side: the photo shows the place, the device shows the report made there. */}
      <section className="container band" aria-labelledby="band-title">
        <div className="band__text">
          <h2 id="band-title" className="band__caption">
            {/* Non-breaking hyphens keep the street name on one line. */}
            {t.home.photoCaption.replace('Karl-Marx-Straße', 'Karl\u2011Marx\u2011Straße')}
          </h2>
          <p className="lead lead--sm">{t.home.bandText}</p>
          {spotlight && (
            <Link href={`/${lang}/reports/${spotlight.id}`} className="band__link">
              {t.home.bandLink}
            </Link>
          )}
        </div>
        <div className="band__visual">
          <Photo photo="rathaus" alt={t.home.photoAlt} className="band__photo" sizes="(min-width: 960px) 680px, 100vw" credit={t.report.photoBy} creditOnPhoto eager />
          {spotlight && (
            <AppPreview
              href={`/${lang}/reports/${spotlight.id}`}
              breadcrumb={`${t.categories[spotlight.category]} / ${t.subcategories[spotlight.subcategory]}`}
              title={spotlight.title[lang]}
              status={spotlight.status}
              statusLabel={t.status[spotlight.status]}
              statusLabels={t.status}
              note={spotlight.officeNote?.[lang]}
              noteTitle={t.report.officeNote}
              meToo={t.report.meToo}
              affected={fill(t.report.meTooCount, { count: spotlight.meToo })}
            />
          )}
        </div>
      </section>

      <section className="section" aria-labelledby="steps-title">
        <div className="container">
          <header className="section__intro">
            <h2 id="steps-title" className="section__title">
              {t.home.stepsTitle}
            </h2>
            <p className="lead lead--sm">{t.home.stepsLead}</p>
          </header>
          {/* A real sequence, so numbered nodes joined by a connector. */}
          <ol className="workflow">
            {steps.map((step, i) => (
              <li key={step.key} className="workflow__step" data-final={i === steps.length - 1 || undefined}>
                <div className="workflow__node">
                  <span className="workflow__icon">
                    <Icon name={step.icon} size={26} />
                  </span>
                  <span className="workflow__number" aria-hidden="true">
                    {i + 1}
                  </span>
                </div>
                <div className="workflow__body">
                  <h3>{t.home.steps[step.key].title}</h3>
                  <p>{t.home.steps[step.key].body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section--ruled" aria-labelledby="numbers-title">
        <div className="container">
          <header className="section__intro">
            <h2 id="numbers-title" className="section__title">
              {t.home.numbersTitle}
            </h2>
            <p className="lead lead--sm">{t.home.numbersLead}</p>
          </header>
          <div className="console__charts">
            <section className="card card--padded" aria-labelledby="home-trend-title">
              <h3 id="home-trend-title" className="title-sm">
                {t.console.trendTitle}
              </h3>
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
            <section className="card card--padded" aria-labelledby="home-category-title">
              <h3 id="home-category-title" className="title-sm">
                {t.console.categoryTitle}
              </h3>
              <p className="muted small">{t.console.categorySubtitle}</p>
              <CategoryBars
                label={t.console.categoryTitle}
                items={OPEN_BY_SUBCATEGORY.map((c) => ({ label: t.subcategories[c.subcategory], count: c.count }))}
              />
            </section>
          </div>
        </div>
      </section>

      <section className="section section--sunk" id="nearby" aria-labelledby="nearby-title">
        <div className="container">
          <header className="section__intro">
            <h2 id="nearby-title" className="section__title">
              {t.home.nearbyTitle}
            </h2>
            <p className="lead lead--sm">{t.home.nearbySubtitle}</p>
          </header>
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
