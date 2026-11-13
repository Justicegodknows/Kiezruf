'use client';

// Confirm the location (US-10): the pin starts at the browser fix and can move up to MAX_PIN_ADJUST_M.
// Drag the pin on the map, or use the buttons (keyboard), which move it 10 m at a time.
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAX_PIN_ADJUST_M } from '@kiezruf/shared';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { formatDistance, formatNumber } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { clampToRadius, distanceM, offsetM, type Point } from '@/lib/geo';
import { MAP_STYLE_URL } from './ReportMap';

const STEP_M = 10;

export function PinAdjuster({ origin, pin, onChange }: { origin: Point; pin: Point; onChange: (pin: Point) => void }) {
  const { t, locale } = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const move = (north: number, east: number) => onChange(clampToRadius(origin, offsetM(pin, north, east), MAX_PIN_ADJUST_M));

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    import('maplibre-gl')
      .then(({ Map, Marker: MarkerClass }) => {
        if (cancelled || !container.current) return;
        map = new Map({ container: container.current, style: MAP_STYLE_URL, center: [origin.lon, origin.lat], zoom: 17, attributionControl: { compact: true } });
        const marker = new MarkerClass({ draggable: true }).setLngLat([origin.lon, origin.lat]).addTo(map);
        marker.on('dragend', () => {
          const p = marker.getLngLat();
          const clamped = clampToRadius(origin, { lat: p.lat, lon: p.lng }, MAX_PIN_ADJUST_M);
          marker.setLngLat([clamped.lon, clamped.lat]);
          onChangeRef.current(clamped);
        });
        mapRef.current = map;
        markerRef.current = marker;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [origin]);

  useEffect(() => {
    markerRef.current?.setLngLat([pin.lon, pin.lat]);
  }, [pin]);

  const moved = distanceM(origin, pin);

  return (
    <div className="stack-sm">
      <div ref={container} className="pin-map" role="region" aria-label={t('pin.mapLabel')} />
      <p role="status" className="small">
        {moved < 1 ? t('pin.atCapture') : t('pin.moved', { distance: formatDistance(locale, moved), max: formatNumber(locale, MAX_PIN_ADJUST_M) })}
      </p>
      <div role="group" aria-label={t('pin.adjust', { step: STEP_M })} className="pin-buttons">
        <button type="button" className="btn sm" onClick={() => move(STEP_M, 0)}>
          <span aria-hidden="true">↑ </span>
          {t('pin.north')}
        </button>
        <button type="button" className="btn sm" onClick={() => move(-STEP_M, 0)}>
          <span aria-hidden="true">↓ </span>
          {t('pin.south')}
        </button>
        <button type="button" className="btn sm" onClick={() => move(0, -STEP_M)}>
          <span aria-hidden="true">← </span>
          {t('pin.west')}
        </button>
        <button type="button" className="btn sm" onClick={() => move(0, STEP_M)}>
          <span aria-hidden="true">→ </span>
          {t('pin.east')}
        </button>
        <button type="button" className="btn ghost sm" onClick={() => onChange(origin)}>
          {t('pin.reset')}
        </button>
      </div>
      <p className="small muted">{t('pin.coords', { lat: pin.lat.toFixed(5), lon: pin.lon.toFixed(5) })}</p>
    </div>
  );
}
