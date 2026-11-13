'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Category, PhotoKey, Status } from '@kiezruf/shared';
import { StatusBadge } from './Badges';
import { Icon } from './Icon';
import { KiezMap } from './KiezMap';
import { Photo } from './Photo';

/** A report already localised on the server, so the client bundle carries no dictionaries. */
export interface ReportListItem {
  id: string;
  href: string;
  title: string;
  category: Category;
  subcategoryLabel: string;
  place: string;
  distance: string;
  age: string;
  status: Status;
  statusLabel: string;
  meTooLabel: string;
  commentsLabel: string;
  safety: boolean;
  photo: PhotoKey;
  /** Alt text for the location photo. */
  photoAlt: string;
  x: number;
  y: number;
}

export interface ExplorerStrings {
  filterLabel: string;
  filterAll: string;
  mapLabel: string;
  mapLegend: string;
  emptyFilter: string;
  resultCount: string;
  safetyHint: string;
  categories: Record<Category, string>;
}

type Filter = 'all' | Category;

export function ReportExplorer({ reports, t }: { reports: ReportListItem[]; t: ExplorerStrings }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [hovered, setHovered] = useState<string | null>(null);
  const visible = useMemo(() => reports.filter((r) => filter === 'all' || r.category === filter), [reports, filter]);
  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: t.filterAll },
    { key: 'traffic', label: t.categories.traffic },
    { key: 'facility', label: t.categories.facility },
  ];

  return (
    <div className="explorer">
      <div className="explorer__toolbar">
        <div className="chips" role="group" aria-label={t.filterLabel}>
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              className="chip"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="explorer__count" aria-live="polite">
          {t.resultCount.replace('{count}', String(visible.length))}
        </p>
      </div>

      <div className="explorer__grid">
        <KiezMap
          label={t.mapLabel}
          legend={
            <>
              <span className="map__legend-dot" data-category="traffic" /> {t.categories.traffic}
              <span className="map__legend-dot" data-category="facility" /> {t.categories.facility}
              <span className="visually-hidden">. {t.mapLegend}</span>
            </>
          }
        >
          {visible.map((r) => (
            <Link
              key={r.id}
              href={r.href}
              className="map__pin"
              data-category={r.category}
              data-active={hovered === r.id || undefined}
              style={{ left: `${r.x}%`, top: `${r.y}%` }}
              onMouseEnter={() => setHovered(r.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(r.id)}
              onBlur={() => setHovered(null)}
            >
              <Icon name="pin" size={18} />
              <span className="map__tip">{r.title}</span>
              <span className="visually-hidden">{`${r.title}, ${r.distance}`}</span>
            </Link>
          ))}
        </KiezMap>

        <ul className="report-list">
          {visible.length === 0 && <li className="empty">{t.emptyFilter}</li>}
          {visible.map((r) => (
            <li key={r.id}>
              <Link
                href={r.href}
                className="report-card card card--interactive"
                data-active={hovered === r.id || undefined}
                onMouseEnter={() => setHovered(r.id)}
                onMouseLeave={() => setHovered(null)}
              >
                <Photo photo={r.photo} alt={r.photoAlt} className="report-card__photo" sizes="(min-width: 900px) 560px, 100vw" />
                <span className="report-card__body">
                  <span className="report-card__meta">
                    <span className="report-card__kind" data-category={r.category}>
                      <Icon name={r.category === 'traffic' ? 'trafficLight' : 'building'} size={16} />
                      {r.subcategoryLabel}
                    </span>
                    <span>
                      <Icon name="pin" size={14} />
                      {r.distance}
                    </span>
                    <span>
                      <Icon name="clock" size={14} />
                      {r.age}
                    </span>
                  </span>
                  <span className="report-card__title">{r.title}</span>
                  <span className="report-card__place">{r.place}</span>
                  <span className="report-card__footer">
                    <StatusBadge status={r.status} label={r.statusLabel} />
                    {r.safety && (
                      <span className="badge badge--outline">
                        <Icon name="shield" size={14} />
                        {t.safetyHint}
                      </span>
                    )}
                    <span className="report-card__stat">
                      <Icon name="hand" size={16} />
                      {r.meTooLabel}
                    </span>
                    <span className="report-card__stat">
                      <Icon name="message" size={16} />
                      {r.commentsLabel}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
