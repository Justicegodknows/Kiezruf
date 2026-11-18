'use client';

// The citizen feed (US-15) after the app prototype: "Berlin ▾" area picker and account button on top, the map of
// petitions, and the petition cards (or a photo grid) below; on wide screens the list sits beside a sticky map.
// A report's URL (/berlin/<bezirk>/<id>) opens its petition pop-up over the feed (the layout's children).
// The first visit starts with the splash and onboarding (Onboarding.tsx). Never score or level (US-24).
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { formatNumber } from '@/i18n';
import { apiOrThrow } from '@/lib/api-client';
import { BERLIN_CENTER, currentFix, distanceM, type Point } from '@/lib/geo';
import { reportIdFromSegment, reportPath } from '@/lib/paths';
import { TOPICS, topicLabelKey, topicOf } from '@/lib/petition';
import { useTopics } from '@/lib/topics';
import { Onboarding } from './kz/Onboarding';
import { PetitionCard, PetitionTile, type FeedReport } from './kz/PetitionCard';
import { AccountButton, KzIcon } from './kz/ui';
import { ReportMap } from './ReportMap';

/** One request for all of Berlin from its centre (the API allows 30 km). */
export const FEED_PATH = `public/reports?${new URLSearchParams({
  lat: BERLIN_CENTER.lat.toFixed(6),
  lon: BERLIN_CENTER.lon.toFixed(6),
  radiusM: '30000',
  limit: '200',
}).toString()}`;

const ALL = 'all';

export function BrowseShell({ children }: { children: ReactNode }) {
  const { t, tp, locale } = useI18n();
  const router = useRouter();
  const params = useParams<{ reportId?: string }>();
  const selectedId = params.reportId ? reportIdFromSegment(params.reportId) : null;
  const query = useQuery({ queryKey: ['public-reports', FEED_PATH], queryFn: () => apiOrThrow<{ reports: FeedReport[] }>(FEED_PATH) });

  const [area, setArea] = useState(ALL);
  const [areaOpen, setAreaOpen] = useState(false);
  const topics = useTopics();
  const [onlyMine, setOnlyMine] = useState(true);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [center, setCenter] = useState<Point>(BERLIN_CENTER);
  const [me, setMe] = useState<Point | null>(null);
  const [compactFab, setCompactFab] = useState(false);
  const areaMenuId = useId();
  const areaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setCompactFab(window.scrollY > 160);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!areaOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !areaRef.current?.contains(e.target as Node)) setAreaOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [areaOpen]);

  const all = useMemo(() => query.data?.reports ?? [], [query.data]);
  const areas = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of all) counts.set(r.tenantName, (counts.get(r.tenantName) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);

  const filterTopics = onlyMine && topics.length > 0;
  const reports = useMemo(() => {
    let list = all.filter((r) => (area === ALL || r.tenantName === area) && (!filterTopics || topics.includes(topicOf(r.category))));
    // Open petitions first, newest first; near the citizen once they asked for it.
    const rank = (r: FeedReport) => (r.status === 'resolved' ? 1 : 0);
    list = [...list].sort((a, b) =>
      me ? distanceM(me, a) - distanceM(me, b) : rank(a) - rank(b) || Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
    return list;
  }, [all, area, filterTopics, topics, me]);

  async function locateMe() {
    try {
      const fix = await currentFix();
      const point = { lat: fix.lat, lon: fix.lon };
      setMe(point);
      setCenter(point);
    } catch {
      // The browser said no; the feed stays as it is.
    }
  }

  function showOnMap(r: FeedReport) {
    setCenter({ lat: r.lat, lon: r.lon });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const areaLabel = area === ALL ? 'Berlin' : area;
  const fitKey = `${area}|${filterTopics ? topics.join(',') : ''}`;

  return (
    <>
      <header className="kz-bar">
        <div className="kz-bar__left">
          <div className="kz-area" ref={areaRef}>
            <button
              type="button"
              className="kz-area__button"
              aria-haspopup="listbox"
              aria-expanded={areaOpen}
              aria-controls={areaMenuId}
              onClick={() => setAreaOpen((o) => !o)}
            >
              {areaLabel}
              <span className="kz-area__chev">
                <KzIcon name="chevron" size={20} stroke={3} />
              </span>
            </button>
            {areaOpen ? (
              <ul id={areaMenuId} role="listbox" aria-label={t('kz.chooseArea')} className="kz-area__menu">
                <li className="kz-area__heading" role="presentation">
                  {t('kz.chooseArea')}
                </li>
                {[[ALL, all.length] as const, ...areas].map(([name, count]) => (
                  <li key={name} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={area === name}
                      className="kz-area__option"
                      onClick={() => {
                        setArea(name);
                        setAreaOpen(false);
                      }}
                    >
                      <span className="kz-area__icon">
                        <KzIcon name="pin" size={16} stroke={2.4} />
                      </span>
                      <span>{name === ALL ? 'Berlin' : name}</span>
                      <span className="kz-area__count">{formatNumber(locale, count)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <div className="kz-bar__right">
          {/* Staff sign in to the console from here (/console asks for the sign-in and the second factor). */}
          <Link href="/console" className="kz-pill kz-pill--quiet" aria-label={t('kz.consoleLong')}>
            {t('kz.console')}
          </Link>
          <AccountButton />
        </div>
      </header>

      <div className="kz-feed">
        <section className="kz-feed__map" aria-label={t('kz.mapLabel')}>
          <ReportMap
            reports={reports}
            selectedId={selectedId}
            center={center}
            fitKey={fitKey}
            onSelect={(report) => router.push(reportPath(report), { scroll: false })}
            onMoved={() => {}}
          />
          <button type="button" className="kz-round kz-map-locate" onClick={() => void locateMe()} aria-label={t('kz.locate')}>
            <KzIcon name="navigate" size={18} stroke={2.2} />
          </button>
        </section>

        <section className="kz-feed__list" aria-label={t('kz.petitionsTitle')}>
          <div className="kz-feed__tools">
            <p role="status" className="kz-note">
              {query.isPending ? t('common.loading') : tp('kz.petitionCount', reports.length)}
            </p>
            <button type="button" className="kz-chip" onClick={() => setView((v) => (v === 'list' ? 'grid' : 'list'))} aria-label={view === 'list' ? t('kz.showGrid') : t('kz.showList')}>
              <KzIcon name={view === 'list' ? 'grid' : 'list'} size={16} stroke={1.9} />
            </button>
          </div>
          {topics.length > 0 ? (
            <div className="kz-feed__topics" role="group" aria-label={t('kz.yourTopics')}>
              <button type="button" className="kz-chip" aria-pressed={!filterTopics} onClick={() => setOnlyMine(false)}>
                {t('filters.all')}
              </button>
              {TOPICS.filter((x) => topics.includes(x.id)).map((x) => (
                <button key={x.id} type="button" className="kz-chip" aria-pressed={filterTopics} onClick={() => setOnlyMine(true)}>
                  {t(topicLabelKey(x.id))}
                </button>
              ))}
            </div>
          ) : null}

          {query.isError ? <p className="kz-empty">{t('error.unavailable')}</p> : null}
          {!query.isPending && !query.isError && reports.length === 0 ? <p className="kz-empty">{t('kz.noPetitions')}</p> : null}
          {view === 'list' ? (
            reports.map((r) => <PetitionCard key={r.publicId} report={r} selected={r.publicId === selectedId} onLocate={() => showOnMap(r)} />)
          ) : (
            <ul className="kz-grid">
              {reports.map((r) => (
                <li key={r.publicId}>
                  <PetitionTile report={r} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Link href="/new-report" className="kz-fab" data-compact={compactFab} aria-label={t('kz.navNew')}>
        <KzIcon name="plus" size={20} stroke={2.6} />
        <span className="kz-fab__label">{t('kz.fabLabel')}</span>
      </Link>

      {children}
      <Onboarding />
    </>
  );
}
