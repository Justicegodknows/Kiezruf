import type { Subcategory } from '@/lib/sample-data';

// Calm, flat placeholder scenes until real (blurred) photos come from the API.
export function ReportIllustration({ subcategory, label }: { subcategory: Subcategory; label: string }) {
  return (
    <svg className="illustration" viewBox="0 0 320 180" role="img" aria-label={label} preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="180" fill="var(--scene-sky)" />
      <rect y="128" width="320" height="52" fill="var(--scene-ground)" />
      <path d="M0 128h320" stroke="var(--scene-line)" strokeWidth="2" />
      <Scene subcategory={subcategory} />
    </svg>
  );
}

function Scene({ subcategory }: { subcategory: Subcategory }) {
  switch (subcategory) {
    case 'trafficLight':
      return (
        <g>
          <rect x="150" y="70" width="6" height="60" fill="var(--scene-obj)" />
          <rect x="138" y="30" width="30" height="52" rx="8" fill="var(--scene-obj)" />
          <circle cx="153" cy="45" r="7" fill="var(--scene-off)" />
          <circle cx="153" cy="67" r="7" fill="var(--scene-off)" />
          <path d="M120 150h80" stroke="var(--scene-mark)" strokeWidth="6" strokeDasharray="12 10" />
        </g>
      );
    case 'pothole':
    case 'bikeLane':
      return (
        <g>
          <path d="M0 150h320" stroke="var(--scene-mark)" strokeWidth="4" strokeDasharray="18 12" />
          {subcategory === 'pothole' ? (
            <ellipse cx="170" cy="156" rx="34" ry="9" fill="var(--scene-obj)" />
          ) : (
            <g>
              <rect x="130" y="96" width="96" height="44" rx="6" fill="var(--scene-obj)" />
              <rect x="196" y="104" width="22" height="16" rx="3" fill="var(--scene-sky)" />
              <circle cx="150" cy="142" r="9" fill="var(--scene-off)" />
              <circle cx="206" cy="142" r="9" fill="var(--scene-off)" />
            </g>
          )}
        </g>
      );
    case 'playground':
      return (
        <g stroke="var(--scene-obj)" strokeWidth="5" fill="none" strokeLinecap="round">
          <path d="M110 128L135 50h50l25 78" />
          <path d="M145 50v52" />
          <path d="M175 50v40" />
          <path d="M138 102h18" stroke="var(--signal)" strokeWidth="6" />
        </g>
      );
    case 'youthCentre':
    case 'toilet':
      return (
        <g>
          <rect x="100" y="48" width="120" height="80" rx="4" fill="var(--scene-obj)" />
          <rect x="146" y="84" width="28" height="44" rx="2" fill="var(--scene-sky)" />
          <rect x="114" y="62" width="22" height="16" rx="2" fill="var(--scene-sky)" />
          <rect x="184" y="62" width="22" height="16" rx="2" fill="var(--scene-sky)" />
          <path d="M160 40l70 12H90z" fill="var(--scene-obj)" />
        </g>
      );
  }
}
