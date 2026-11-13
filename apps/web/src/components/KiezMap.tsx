import { KIEZ_MAP } from '@kiezruf/shared';
import type { ReactNode } from 'react';

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

/**
 * Labelled street diagram of north Neukölln (packages/shared/src/kiez-map.ts). Street names are
 * HTML on top of the SVG so they keep a readable size at every width; pins come in as children.
 */
export function KiezMap({ label, legend, children }: { label: string; legend: ReactNode; children: ReactNode }) {
  const { width: W, height: H } = KIEZ_MAP;
  return (
    <figure className="map card" aria-label={label}>
      <svg viewBox={`0 0 ${W} ${H}`} className="map__base" aria-hidden="true">
        <rect width={W} height={H} fill="var(--map-bg)" />
        <path d={KIEZ_MAP.park} fill="var(--map-park)" />
        <path d={KIEZ_MAP.water} fill="var(--map-water)" />
        <g stroke="var(--map-road)" strokeLinecap="round" fill="none">
          {KIEZ_MAP.minorStreets.map((d) => (
            <path key={d} d={d} strokeWidth="3" />
          ))}
          {KIEZ_MAP.majorStreets.map((d) => (
            <path key={d} d={d} strokeWidth="6" />
          ))}
        </g>
      </svg>
      {KIEZ_MAP.labels.map((l) => (
        <span
          key={l.text}
          className="map__street"
          aria-hidden="true"
          style={{ left: pct(l.x, W), top: pct(l.y, H), transform: `translate(-50%, -50%) rotate(${l.angle}deg)` }}
        >
          {l.text}
        </span>
      ))}
      <span className="map__street map__street--hint" aria-hidden="true" style={{ left: pct(KIEZ_MAP.offMapHint.x, W), top: pct(KIEZ_MAP.offMapHint.y, H) }}>
        {KIEZ_MAP.offMapHint.text}
      </span>
      {children}
      <figcaption className="map__legend">{legend}</figcaption>
    </figure>
  );
}
