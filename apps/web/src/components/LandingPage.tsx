'use client';

// Landing page at `/`, after the design merged from main (PR 2): hero with the newest reports as Berlin street-name
// plates, the Rathaus Neukölln photo beside a phone-sized preview of a report, the four steps, and the way to the map.
// Unlike main's version it shows real reports from the public API, never demo data. Citizen data only: status, Me too
// and the office's note, never score or level (US-24).
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { intlLocale, type Locale, type MessageKey } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { apiOrThrow, type PublicReport, type ReportDetail } from '@/lib/api-client';
import { BERLIN_CENTER } from '@/lib/geo';
import { reportPath } from '@/lib/paths';
import { Icon, type IconName } from './Icon';
import { categoryLabel, groupLabel, statusLabel } from './labels';
import { StatusBadge } from './StatusBadge';

/** Same query as the city-wide map (BrowseShell), so both share the react-query cache. */
export const LANDING_REPORTS_PATH = `public/reports?${new URLSearchParams({
  lat: BERLIN_CENTER.lat.toFixed(6),
  lon: BERLIN_CENTER.lon.toFixed(6),
  radiusM: '10000',
  limit: '100',
}).toString()}`;

const PLATE_COUNT = 3;
const STEPS: { key: 'photo' | 'locate' | 'follow' | 'fixed'; icon: IconName }[] = [
  { key: 'photo', icon: 'camera' },
  { key: 'locate', icon: 'pin' },
  { key: 'follow', icon: 'bell' },
  { key: 'fixed', icon: 'check' },
];
/** The progress a citizen sees in the app's report screen. */
const TIMELINE = ['open', 'acknowledged', 'in_progress', 'resolved'] as const;

// Photo from Wikimedia Commons; its licence asks for this credit next to it.
const RATHAUS = {
  src: '/photos/rathaus.jpg',
  author: 'Beek100',
  license: 'CC BY-SA 3.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
  source: 'https://commons.wikimedia.org/wiki/File:Berlin,_Neukoelln,_Karl-Marx-Strasse_83,_Rathaus_Neukoelln.jpg',
};

/** The newest reports that are not resolved yet, newest first. */
export function newestOpen(reports: readonly PublicReport[], count = PLATE_COUNT): PublicReport[] {
  return reports
    .filter((r) => r.status !== 'resolved')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, count);
}

/** "3 hours ago", "vor 2 Tagen": the largest whole unit, or null under a minute (the caller says "just now"). */
export function formatAge(locale: Locale, iso: string, now = Date.now()): string | null {
  const seconds = Math.round((now - Date.parse(iso)) / 1000);
  if (!Number.isFinite(seconds)) return null;
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) if (seconds >= size) return rtf.format(-Math.floor(seconds / size), unit);
  return null;
}

export function LandingPage() {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ['public-reports', LANDING_REPORTS_PATH],
    queryFn: () => apiOrThrow<{ reports: PublicReport[] }>(LANDING_REPORTS_PATH),
  });
  const plates = newestOpen(query.data?.reports ?? []);
  const spotlight = plates[0];

  return (
    <div className="landing">
      <section className="hero" aria-labelledby="hero-title">
        <div className="container hero__inner">
          <div className="hero__copy">
            <h1 id="hero-title" className="display">
              {t('home.title')}
            </h1>
            <p className="hero__lead">{t('home.lead')}</p>
            <div className="hero__actions">
              <Link href="/berlin" className="btn primary lg">
                <Icon name="pin" />
                {t('home.ctaBrowse')}
              </Link>
              <Link href="/new-report" className="btn lg">
                <Icon name="camera" />
                {t('home.ctaReport')}
              </Link>
            </div>
          </div>
          <Plates reports={plates} state={query.isPending ? 'loading' : query.isError ? 'error' : 'ready'} />
        </div>
      </section>

      <section className="container band" aria-labelledby="band-title">
        <div className="band__text">
          <h2 id="band-title" className="band__caption">
            {t('home.photoCaption')}
          </h2>
          <p className="hero__lead">{t('home.bandText')}</p>
          {spotlight ? (
            <Link href={reportPath(spotlight)} className="band__link">
              {t('home.bandLink')}
            </Link>
          ) : null}
        </div>
        <div className={spotlight ? 'band__visual band__visual--device' : 'band__visual'}>
          <figure className="photo">
            <div className="photo__frame">
              <Image src={RATHAUS.src} alt={t('home.photoAlt')} fill sizes="(min-width: 960px) 680px, 100vw" className="photo__img" priority />
            </div>
            <figcaption className="photo__credit">
              {t('home.photoBy')}: {RATHAUS.author},{' '}
              <a href={RATHAUS.licenseUrl} rel="license noopener" target="_blank">
                {RATHAUS.license}
              </a>
              ,{' '}
              <a href={RATHAUS.source} rel="noopener" target="_blank">
                Wikimedia Commons
              </a>
            </figcaption>
          </figure>
          {spotlight ? <AppPreview report={spotlight} /> : null}
        </div>
      </section>

      <section className="section" aria-labelledby="steps-title">
        <div className="container">
          <header className="section__intro">
            <h2 id="steps-title" className="section__title">
              {t('home.stepsTitle')}
            </h2>
            <p className="hero__lead">{t('home.stepsLead')}</p>
          </header>
          <ol className="workflow">
            {STEPS.map((step, i) => (
              <li key={step.key} className="workflow__step" data-final={i === STEPS.length - 1 || undefined}>
                <div className="workflow__node">
                  <span className="workflow__icon">
                    <Icon name={step.icon} size={26} />
                  </span>
                  <span className="workflow__number" aria-hidden="true">
                    {i + 1}
                  </span>
                </div>
                <div className="workflow__body">
                  <h3>{t(`home.steps.${step.key}.title` as MessageKey)}</h3>
                  <p>{t(`home.steps.${step.key}.body` as MessageKey)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section--sunk" aria-labelledby="map-title">
        <div className="container">
          <div className="section__intro">
            <h2 id="map-title" className="section__title">
              {t('home.mapTitle')}
            </h2>
            <p className="hero__lead">{t('home.mapLead')}</p>
            <p className="hero__actions">
              <Link href="/berlin" className="btn primary lg">
                <Icon name="pin" />
                {t('home.ctaBrowse')}
              </Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

// Signature element: what was just reported, as Berlin street-name plates (category large, Bezirk small).
function Plates({ reports, state }: { reports: PublicReport[]; state: 'loading' | 'error' | 'ready' }) {
  const { t, locale } = useI18n();
  const message =
    state === 'loading' ? t('home.platesLoading') : state === 'error' ? t('home.platesError') : reports.length === 0 ? t('home.platesEmpty') : null;
  return (
    <div className="plates">
      <h2 className="plates__caption">{t('home.platesLabel')}</h2>
      {message ? (
        <p className="plates__message" role={state === 'loading' ? undefined : 'status'}>
          {message}
        </p>
      ) : (
        <ul className="plates__list">
          {reports.map((r) => (
            <li key={r.publicId}>
              <Link href={reportPath(r)} className="plate">
                <span className="plate__district">{r.tenantName}</span>
                <span className="plate__street">{categoryLabel(t, r.category)}</span>
                <span className="plate__issue">
                  <span>
                    {groupLabel(t, r.category)} · {statusLabel(t, r.status)}
                  </span>
                  <span className="plate__age">{formatAge(locale, r.createdAt) ?? t('home.age.now')}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A phone-sized rendering of the app's report screen, built from the newest report (not a screenshot). It is a
 * picture of the app: a pointer can click through, while keyboard and screen-reader users get the "Open the newest
 * report" link beside it, so the report is never announced twice.
 */
function AppPreview({ report }: { report: PublicReport }) {
  const { t, tp } = useI18n();
  const path = `public/reports/${report.publicId}`;
  // The office's note is only in the detail answer.
  const detail = useQuery({ queryKey: ['public-report', report.publicId], queryFn: () => apiOrThrow<ReportDetail>(path) });
  const note = detail.data?.publicNote;
  const step = TIMELINE.indexOf(report.status as (typeof TIMELINE)[number]);
  return (
    <Link href={reportPath(report)} className="device" aria-hidden="true" tabIndex={-1}>
      <span className="device__screen">
        <span className="device__bar">
          <span>9:41</span>
          <span className="device__notch" />
        </span>
        <span className="device__body">
          <span className="device__crumb">
            {report.tenantName} / {groupLabel(t, report.category)}
          </span>
          <span className="device__title">{categoryLabel(t, report.category)}</span>
          <StatusBadge status={report.status} label={statusLabel(t, report.status)} />
          {step >= 0 ? (
            <span className="device__timeline">
              {TIMELINE.map((s, i) => (
                <span key={s} className="device__step" data-state={i < step ? 'done' : i === step ? 'current' : 'todo'}>
                  <span className="device__dot" />
                  <span>{statusLabel(t, s)}</span>
                </span>
              ))}
            </span>
          ) : null}
          {note ? (
            <span className="device__note">
              <strong>{t('detail.officeNote', { office: report.office ?? report.tenantName })}</strong>
              {note}
            </span>
          ) : null}
        </span>
        <span className="device__action">
          <span className="device__button">
            <Icon name="hand" size={15} />
            {t('meToo.button')}
          </span>
          <span className="device__affected">{tp('meToo.count', report.meTooCount)}</span>
        </span>
      </span>
    </Link>
  );
}
