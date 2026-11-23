'use client';

// Map of nearby reports (US-15) with MapLibre (ENG-13). Loaded in the browser only. The list next to it is the
// full keyboard and screen-reader alternative, so the pins are pointer shortcuts and not in the tab order.
// Pins are neutral: the same shape for every report, no score or level (US-24).
import 'maplibre-gl/dist/maplibre-gl.css';
import { loadMapLibre } from '@/lib/maplibre';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import type { PublicReport } from '@/lib/api-client';
import type { Point } from '@/lib/geo';
import { categoryLabel, statusLabel } from './labels';

export const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';

/**
 * Recolours the base map to the app prototype's blues (kiezruf-app-prototype.html): pale blue land, white streets,
 * blue water, muted labels, no points of interest. Layer names differ between styles, so this goes by layer type and
 * a few name parts, and skips what does not apply.
 */
export function tintToPrototype(map: Pick<MapLibreMap, 'getStyle' | 'setPaintProperty' | 'setLayoutProperty'>): void {
  const layers = map.getStyle()?.layers ?? [];
  const set = (id: string, prop: string, value: unknown) => {
    try {
      map.setPaintProperty(id, prop as never, value as never);
    } catch {
      // A property this layer does not have.
    }
  };
  for (const layer of layers) {
    const id = layer.id;
    const name = id.toLowerCase();
    if (layer.type === 'background') set(id, 'background-color', '#E4EBF8');
    else if (layer.type === 'fill' && name.includes('water')) set(id, 'fill-color', '#B9CCF5');
    else if (layer.type === 'fill' && /park|wood|grass|forest|green|cemetery|pitch/.test(name)) set(id, 'fill-color', '#D3E2FA');
    else if (layer.type === 'fill' && name.includes('building')) set(id, 'fill-color', '#D5DFF2');
    else if (layer.type === 'fill-extrusion') set(id, 'fill-extrusion-color', '#D5DFF2');
    else if (layer.type === 'fill') set(id, 'fill-color', '#E1E9F8');
    else if (layer.type === 'line' && /water|river|canal|stream/.test(name)) set(id, 'line-color', '#B9CCF5');
    else if (layer.type === 'line' && /rail|transit/.test(name)) set(id, 'line-color', '#C3D3F3');
    else if (layer.type === 'line' && /boundary|admin/.test(name)) set(id, 'line-color', '#8DA7E0');
    else if (layer.type === 'line') set(id, 'line-color', '#FFFFFF');
    else if (layer.type === 'symbol') {
      if (/poi|shield|aerodrome|airport|housenumber/.test(name)) {
        try {
          map.setLayoutProperty(id, 'visibility', 'none');
        } catch {
          // Not a layer we can hide.
        }
      } else {
        set(id, 'text-color', '#45557A');
        set(id, 'text-halo-color', '#F3F6FC');
      }
    }
  }
}

/** South-west and north-east corners around the reports, as [lon, lat]; null without reports. */
export function reportBounds(reports: readonly Pick<PublicReport, 'lat' | 'lon'>[]): [[number, number], [number, number]] | null {
  if (reports.length === 0) return null;
  const lons = reports.map((r) => r.lon);
  const lats = reports.map((r) => r.lat);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

export function ReportMap({
  reports,
  selectedId,
  center,
  onSelect,
  onMoved,
  fitKey,
}: {
  reports: PublicReport[];
  selectedId: string | null;
  center: Point;
  /** When it changes (another area or topic filter), the view fits the reports again. */
  fitKey?: string;
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
  /** The first view fits the reports once; after that, or once the citizen moved the map, it is theirs. */
  const viewSettled = useRef(false);

  useEffect(() => {
    onMovedRef.current = onMoved;
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    loadMapLibre()
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
          viewSettled.current = true;
          const c = map!.getCenter();
          onMovedRef.current({ lat: c.lat, lon: c.lng });
        });
        // A failed style load leaves an empty map; later tile errors are not worth a message.
        let loaded = false;
        map.on('load', () => {
          loaded = true;
          tintToPrototype(map!);
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
    viewSettled.current = false;
  }, [fitKey]);

  // First view: zoom to all reports, so the pins are in sight whatever the screen size (demo, 2026-11-18).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || viewSettled.current || selectedId) return;
    const bounds = reportBounds(reports);
    if (!bounds) return;
    viewSettled.current = true;
    map.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 0 });
  }, [reports, selectedId, ready, fitKey]);

  useEffect(() => {
    const report = reports.find((r) => r.publicId === selectedId);
    if (!report) return;
    viewSettled.current = true;
    mapRef.current?.easeTo({ center: [report.lon, report.lat] });
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
