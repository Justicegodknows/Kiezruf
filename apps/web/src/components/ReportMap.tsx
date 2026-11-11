'use client';

// Map of nearby reports (US-15) with MapLibre (ENG-13). Loaded in the browser only. The list next to it is the
// full keyboard and screen-reader alternative, so the pins are pointer shortcuts and not in the tab order.
// Pins are neutral: the same shape for every report, no score or level (US-24).
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import type { PublicReport } from '@/lib/api-client';
import type { Point } from '@/lib/geo';
import { categoryLabel, statusLabel } from './labels';

export const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';

export function ReportMap({
  reports,
  selectedId,
  center,
  onSelect,
  onMoved,
}: {
  reports: PublicReport[];
  selectedId: string | null;
  center: Point;
  onSelect: (report: PublicReport) => void;
  onMoved: (center: Point) => void;
}) {
  const { t } = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const markerClass = useRef<typeof Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const onMovedRef = useRef(onMoved);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onMovedRef.current = onMoved;
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    import('maplibre-gl')
      .then(({ Map, Marker: MarkerClass, NavigationControl }) => {
        if (cancelled || !container.current) return;
        map = new Map({
          container: container.current,
          style: MAP_STYLE_URL,
          center: [center.lon, center.lat],
          zoom: 13,
          attributionControl: { compact: true },
        });
        map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
        map.on('moveend', (event) => {
          // Only moves the citizen made, not the ones this component started.
          if (!('originalEvent' in event) || !event.originalEvent) return;
          const c = map!.getCenter();
          onMovedRef.current({ lat: c.lat, lon: c.lng });
        });
        // A failed style load leaves an empty map; later tile errors are not worth a message.
        let loaded = false;
        map.on('load', () => {
          loaded = true;
        });
        map.on('error', () => {
          if (!loaded) setFailed(true);
        });
        mapRef.current = map;
        markerClass.current = MarkerClass;
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
    // The map is created once; later centre changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mapRef.current?.easeTo({ center: [center.lon, center.lat] });
  }, [center.lat, center.lon, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const MarkerClass = markerClass.current;
    if (!map || !MarkerClass) return;
    markers.current.forEach((m) => m.remove());
    markers.current = reports.map((report) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.tabIndex = -1;
      el.className = `pin${report.publicId === selectedId ? ' pin-selected' : ''}`;
      el.setAttribute('aria-label', `${categoryLabel(t, report.category)}, ${statusLabel(t, report.status)}, ${report.publicId}`);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectRef.current(report);
      });
      return new MarkerClass({ element: el, anchor: 'bottom' }).setLngLat([report.lon, report.lat]).addTo(map);
    });
  }, [reports, selectedId, ready, t]);

  useEffect(() => {
    const report = reports.find((r) => r.publicId === selectedId);
    if (report) mapRef.current?.easeTo({ center: [report.lon, report.lat] });
  }, [selectedId, reports, ready]);

  return (
    <section className="map-wrap" aria-label={t('map.label')}>
      <p className="visually-hidden">{t('map.listAlternative')}</p>
      <div ref={container} className="map" />
      {failed ? (
        <p className="map-failed" role="status">
          {t('map.failed')}
        </p>
      ) : null}
    </section>
  );
}
