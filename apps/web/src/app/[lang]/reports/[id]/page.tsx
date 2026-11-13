import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StatusBadge } from '@/components/Badges';
import { Icon } from '@/components/Icon';
import { MeTooButton } from '@/components/MeTooButton';
import { ReportIllustration } from '@/components/ReportIllustration';
import { hasLocale, locales } from '@/i18n/config';
import { fill, formatAge, formatDistance } from '@/i18n/format';
import { getDictionary } from '@/i18n/get-dictionary';
import { STATUS_ORDER, getPublicReport, reportIds } from '@/lib/sample-data';

export function generateStaticParams() {
  return locales.flatMap((lang) => reportIds().map((id) => ({ lang, id })));
}

export async function generateMetadata({ params }: PageProps<'/[lang]/reports/[id]'>): Promise<Metadata> {
  const { lang, id } = await params;
  const report = getPublicReport(id);
  return hasLocale(lang) && report ? { title: report.title[lang] } : {};
}

export default async function ReportPage({ params }: PageProps<'/[lang]/reports/[id]'>) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const report = getPublicReport(id);
  if (!report) notFound();
  const t = await getDictionary(lang);
  const title = report.title[lang];
  const currentStep = STATUS_ORDER.indexOf(report.status);

  return (
    <div className="container page">
      <Link href={`/${lang}#nearby`} className="back-link">
        <Icon name="arrowLeft" size={18} />
        {t.report.backToList}
      </Link>

      <div className="detail">
        <article className="detail__main">
          <figure className="detail__media card">
            <ReportIllustration subcategory={report.subcategory} label={fill(t.report.photoAlt, { title })} />
          </figure>

          <header className="detail__header">
            <p className="eyebrow">
              {t.categories[report.category]} · {t.subcategories[report.subcategory]}
            </p>
            <h1 className="title-xl">{title}</h1>
            <div className="detail__badges">
              <StatusBadge status={report.status} label={t.status[report.status]} />
              {report.safetyCategory && (
                <span className="badge badge--outline">
                  <Icon name="shield" size={14} />
                  {t.report.safetyHint}
                </span>
              )}
            </div>
            <p className="lead lead--sm">{report.description[lang]}</p>
          </header>

          {report.officeNote && (
            <aside className="callout">
              <Icon name="building" size={20} />
              <div>
                <p className="callout__title">{t.report.officeNote}</p>
                <p>{report.officeNote[lang]}</p>
              </div>
            </aside>
          )}

          <section aria-labelledby="progress-title" className="detail__section">
            <h2 id="progress-title" className="title-md">
              {t.report.progressTitle}
            </h2>
            <ol className="timeline">
              {STATUS_ORDER.map((status, i) => (
                <li
                  key={status}
                  className="timeline__step"
                  data-state={i < currentStep ? 'done' : i === currentStep ? 'current' : 'todo'}
                  aria-current={i === currentStep ? 'step' : undefined}
                >
                  <span className="timeline__dot">{i < currentStep && <Icon name="check" size={14} />}</span>
                  <span className="timeline__label">{t.status[status]}</span>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="comments-title" className="detail__section">
            <h2 id="comments-title" className="title-md">
              {t.report.commentsTitle} <span className="count">{report.comments.length}</span>
            </h2>
            {report.comments.length === 0 ? (
              <p className="muted">{t.report.noComments}</p>
            ) : (
              <ul className="comments">
                {report.comments.map((c, i) => (
                  <li key={i} className="comment" data-staff={c.staff || undefined}>
                    <span className="avatar" aria-hidden="true">
                      {c.staff ? <Icon name="building" size={16} /> : c.author.charAt(0)}
                    </span>
                    <div>
                      <p className="comment__meta">
                        <strong>{c.author}</strong> · {formatAge(c.ageHours, lang)}
                      </p>
                      <p>{c.text[lang]}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </article>

        <aside className="detail__aside">
          <div className="card card--padded sticky">
            <MeTooButton
              initialCount={report.meToo}
              label={t.report.meToo}
              pressedLabel={t.report.meTooPressed}
              countTemplate={t.report.meTooCount}
            />
            <h2 className="title-sm detail__facts-title">{t.report.detailsTitle}</h2>
            <dl className="facts">
              <div>
                <dt>
                  <Icon name="pin" size={16} />
                  {t.report.location}
                </dt>
                <dd>
                  {report.place}
                  <span className="muted small"> · {fill(t.report.distance, { distance: formatDistance(report.distanceMetres, lang) })}</span>
                </dd>
              </div>
              <div>
                <dt>
                  <Icon name="clock" size={16} />
                  {t.report.reported}
                </dt>
                <dd>{formatAge(report.ageHours, lang)}</dd>
              </div>
              <div>
                <dt>
                  <Icon name="users" size={16} />
                  {t.report.involvement}
                </dt>
                <dd>
                  {fill(t.report.coReporters, { count: report.coReporters })} ·{' '}
                  {fill(t.report.comments, { count: report.comments.length })}
                </dd>
              </div>
              <div>
                <dt>
                  <Icon name="inbox" size={16} />
                  {t.report.reference}
                </dt>
                <dd className="mono">{report.id}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
