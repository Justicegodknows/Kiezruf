'use client';

// The report's map position for staff (MapLibre, ENG-13). The coordinates next to it are the text alternative,
// so the map is not in the tab order.
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { MAP_STYLE_URL } from '@/components/ReportMap';
import { useI18n } from '@/i18n/I18nProvider';

export function LocationMap({ lat, lon, label }: { lat: number; lon: number; label: string }) {
  const { t } = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let map: { remove: () => void } | null = null;
    import('maplibre-gl')
      .then(({ Map, Marker }) => {
        if (cancelled || !container.current) return;
        const m = new Map({ container: container.current, style: MAP_STYLE_URL, center: [lon, lat], zoom: 16, attributionControl: { compact: true }, interactive: true });
        m.keyboard.disable();
        // The canvas is the only part hidden: it would otherwise be a tab stop with nothing to do. The attribution
        // control stays reachable (map data credits), so the container itself must not be aria-hidden.
        const canvas = m.getCanvas();
        canvas.setAttribute('tabindex', '-1');
        canvas.setAttribute('aria-hidden', 'true');
        const el = document.createElement('div');
        el.className = 'pin pin-selected';
        el.setAttribute('aria-hidden', 'true');
        new Marker({ element: el, anchor: 'bottom' }).setLngLat([lon, lat]).addTo(m);
        let loaded = false;
        m.on('load', () => {
          loaded = true;
        });
        m.on('error', () => {
          if (!loaded) setFailed(true);
        });
        map = m;
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lon]);

  return (
    <figure className="location-map">
      <div ref={container} className="pin-map" />
      <figcaption className="small">
        {label}: {t('pin.coords', { lat: lat.toFixed(5), lon: lon.toFixed(5) })}
        {failed ? <span className="muted"> · {t('console.map.failed')}</span> : null}
      </figcaption>
    </figure>
  );
}
