'use client';

// Hotspot clusters on a MapLibre map (US-50, ENG-13). A cluster's colour is the highest level inside and its size
// the report count; each marker also carries the level's shape and the count as text, so nothing depends on colour
// alone. The table on the page holds the same data and is the keyboard and screen-reader alternative, so the map
// is hidden from assistive technology and its markers are not in the tab order. Clicking a marker moves focus to
// the cluster's row in the table.
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Level } from '@kiezruf/shared';
import { useEffect, useRef, useState } from 'react';
import { MAP_STYLE_URL } from '@/components/ReportMap';
import { useI18n } from '@/i18n/I18nProvider';
import { clusterSize, type HotspotCluster } from '../analysis';
import { levelLabel } from '../format';
import { LEVEL_SHAPES } from './LevelChip';

export function HotspotMap({ clusters, onSelect }: { clusters: HotspotCluster[]; onSelect: (id: string) => void }) {
  const { t } = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    if (clusters.length === 0) return;
    let cancelled = false;
    let map: { remove: () => void } | null = null;
    import('maplibre-gl')
      .then(({ Map, Marker, LngLatBounds, NavigationControl }) => {
        if (cancelled || !container.current) return;
        const first = clusters[0]!;
        const m = new Map({ container: container.current, style: MAP_STYLE_URL, center: [first.lon, first.lat], zoom: 13, attributionControl: { compact: true } });
        m.keyboard.disable();
        m.addControl(new NavigationControl({ showCompass: false }), 'top-right');
        if (clusters.length > 1) {
          const bounds = new LngLatBounds();
          clusters.forEach((c) => bounds.extend([c.lon, c.lat]));
          m.fitBounds(bounds, { padding: 48, maxZoom: 16, animate: false });
        }
        // Smaller clusters on top, so a big one never hides them.
        [...clusters]
          .sort((a, b) => b.count - a.count)
          .forEach((c) => {
            const size = clusterSize(c.count);
            const el = document.createElement('button');
            el.type = 'button';
            el.tabIndex = -1;
            el.className = `cluster level-${c.level.toLowerCase()}`;
            el.style.width = `${size}px`;
            el.style.height = `${size}px`;
            el.title = `${levelLabel(t, c.level)} · ${c.count}`;
            el.textContent = `${LEVEL_SHAPES[c.level as Level]} ${c.count}`;
            el.addEventListener('click', (e) => {
              e.stopPropagation();
              onSelectRef.current(c.id);
            });
            new Marker({ element: el }).setLngLat([c.lon, c.lat]).addTo(m);
          });
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
  }, [clusters, t]);

  return (
    <figure className="hotspot-map">
      <div ref={container} className="pin-map hotspot-canvas" aria-hidden="true" />
      <figcaption className="small">
        <span>{t('console.hotspots.mapCaption')}</span>
        <span className="legend" aria-hidden="true">
          {(['Critical', 'High', 'Medium', 'Low'] as const).map((l) => (
            <span key={l} className={`level level-${l.toLowerCase()}`}>
              {LEVEL_SHAPES[l]} {levelLabel(t, l)}
            </span>
          ))}
        </span>
        {failed ? <span className="muted"> {t('console.hotspots.mapFailed')}</span> : null}
      </figcaption>
    </figure>
  );
}
