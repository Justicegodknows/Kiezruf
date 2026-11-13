import { PHOTO_KEYS, PHOTOS } from '@kiezruf/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Photo } from '@/components/Photo';
import { hasLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/get-dictionary';

export async function generateMetadata({ params }: PageProps<'/[lang]/credits'>): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: (await getDictionary(lang)).credits.title };
}

/** Attribution for every location photo, as their free licences require. */
export default async function CreditsPage({ params }: PageProps<'/[lang]/credits'>) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);

  return (
    <div className="container page">
      <header className="section__intro">
        <h1 className="title-xl">{t.credits.title}</h1>
        <p className="lead lead--sm">{t.credits.lead}</p>
      </header>
      <ul className="credits">
        {PHOTO_KEYS.map((key, i) => {
          const c = PHOTOS[key];
          return (
            <li key={key} className="credits__item card">
              <Photo photo={key} alt={c.place} className="credits__photo" sizes="(min-width: 900px) 360px, 100vw" eager={i === 0} />
              <dl className="credits__facts">
                <dt className="visually-hidden">{t.credits.photo}</dt>
                <dd className="credits__place">{c.place}</dd>
                <dt>{t.credits.photo}</dt>
                <dd>{c.author}</dd>
                <dt>{t.credits.license}</dt>
                <dd>
                  <a href={c.licenseUrl} rel="license noopener" target="_blank">
                    {c.license}
                  </a>
                </dd>
                <dt>{t.credits.source}</dt>
                <dd>
                  <a href={c.source} rel="noopener" target="_blank">
                    Wikimedia Commons
                  </a>
                </dd>
              </dl>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
