// How "Me too" support grew since a report was posted: one series, one hue, the current total
// labelled at the line's end, so the shape and the number read together. Server-rendered SVG.
export function SupportChart({
  values,
  title,
  startLabel,
  endLabel,
  summary,
}: {
  values: number[];
  title: string;
  startLabel: string;
  endLabel: string;
  /** Text alternative, e.g. "20 neighbours, from 0 when posted". */
  summary: string;
}) {
  const W = 280;
  const H = 72;
  const pad = { top: 10, right: 30, bottom: 4, left: 4 };
  const max = Math.max(1, ...values);
  const x = (i: number) => pad.left + (i / (values.length - 1)) * (W - pad.left - pad.right);
  const y = (v: number) => pad.top + (1 - v / max) * (H - pad.top - pad.bottom);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(values.length - 1).toFixed(1)} ${H - pad.bottom} L${x(0).toFixed(1)} ${H - pad.bottom} Z`;
  const last = values.length - 1;

  return (
    <figure className="support">
      <figcaption className="support__title">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="support__plot" role="img" aria-label={summary}>
        <line x1={pad.left} x2={W - pad.right} y1={H - pad.bottom} y2={H - pad.bottom} stroke="var(--line)" />
        <path d={area} fill="var(--series-1)" opacity="0.12" />
        <path d={line} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(last)} cy={y(values[last])} r="4" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />
        <text x={x(last) + 8} y={y(values[last]) + 4} className="support__value">
          {values[last]}
        </text>
      </svg>
      <div className="support__axis" aria-hidden="true">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
    </figure>
  );
}
