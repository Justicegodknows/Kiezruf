import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon, type IconName } from '@/components/Icon';
import { ReportExplorer, type ReportListItem } from '@/components/ReportExplorer';
import { hasLocale } from '@/i18n/config';
import { fill, formatAge, formatDistance, formatNumber } from '@/i18n/format';
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
    { key: 'fixed', icon: 'check' },
  ];

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
