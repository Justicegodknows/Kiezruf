'use client';

import type { Level } from '@kiezruf/shared';
import { useState } from 'react';
import type { Status } from '@/lib/sample-data';
import { LevelChip, StatusBadge } from '../Badges';
import { Icon } from '../Icon';

export interface QueueRow {
  id: string;
  title: string;
  place: string;
  subcategoryLabel: string;
  level: Level;
  levelLabel: string;
  score: string;
  status: Status;
  statusLabel: string;
  age: string;
  breakdown: {
    coReporters: string;
    commenters: string;
    meToo: string;
    base: string;
    decay: string;
    danger: string;
    safety: string;
    score: string;
  };
  /** Raw base-point contributions, for the proportion bar. */
  points: { coReporters: number; commenters: number; meToo: number };
}

export interface QueueStrings {
  colReport: string;
  colLevel: string;
  colScore: string;
  colStatus: string;
  colAge: string;
  breakdownTitle: string;
  basePoints: string;
  coReportersTimes: string;
  meTooTimes: string;
  commentersTimes: string;
  decay: string;
  decayHint: string;
  danger: string;
  safety: string;
  total: string;
  staffOnly: string;
  reference: string;
  place: string;
}

export function QueuePanel({ rows, t }: { rows: QueueRow[]; t: QueueStrings }) {
  const [selectedId, setSelectedId] = useState(rows[0]?.id);
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0];

  return (
    <div className="queue">
      <div className="queue__table card">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{t.colReport}</th>
              <th scope="col" className="hide-md">{t.place}</th>
              <th scope="col">{t.colLevel}</th>
              <th scope="col" className="num">{t.colScore}</th>
              <th scope="col" className="hide-sm">{t.colStatus}</th>
              <th scope="col" className="num hide-sm">{t.colAge}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} aria-selected={r.id === selected?.id} onClick={() => setSelectedId(r.id)}>
                <th scope="row">
                  {/* A real button keeps row selection keyboard accessible. */}
                  <button type="button" className="row-button" onClick={() => setSelectedId(r.id)}>
                    <span className="row-button__title">{r.title}</span>
                    <span className="row-button__meta">
                      <span className="mono">{r.id}</span> · {r.subcategoryLabel}
                    </span>
                  </button>
                </th>
                <td className="hide-md muted">{r.place}</td>
                <td>
                  <LevelChip level={r.level} label={r.levelLabel} />
                </td>
                <td className="num mono strong">{r.score}</td>
                <td className="hide-sm">
                  <StatusBadge status={r.status} label={r.statusLabel} />
                </td>
                <td className="num hide-sm muted nowrap">{r.age}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && <Breakdown row={selected} t={t} />}
    </div>
  );
}

function Breakdown({ row, t }: { row: QueueRow; t: QueueStrings }) {
  const { points: p, breakdown: b } = row;
  const base = p.coReporters + p.commenters + p.meToo || 1;
  const parts = [
    { key: 'co', label: t.coReportersTimes, value: b.coReporters, share: p.coReporters / base },
    { key: 'cm', label: t.commentersTimes, value: b.commenters, share: p.commenters / base },
    { key: 'mt', label: t.meTooTimes, value: b.meToo, share: p.meToo / base },
  ];
  const factors = [
    { label: t.decay, hint: t.decayHint, value: b.decay },
    { label: t.danger, value: b.danger },
    { label: t.safety, value: b.safety },
  ];

  return (
    <section className="breakdown card" aria-live="polite" aria-labelledby="breakdown-title">
      <header className="breakdown__head">
        <div>
          <p className="eyebrow">
            <Icon name="lock" size={14} /> {t.staffOnly}
          </p>
          <h3 id="breakdown-title">{t.breakdownTitle}</h3>
        </div>
        <div className="breakdown__report">
          <p className="breakdown__report-title">{row.title}</p>
          <p className="muted small">
            {t.reference} <span className="mono">{row.id}</span>
          </p>
        </div>
      </header>

      <div className="breakdown__grid">
        <div className="breakdown__base">
          <p className="breakdown__caption">{t.basePoints}</p>
          {/* Proportion of base points; each segment is also listed with its value below. */}
          <div className="stackbar" aria-hidden="true">
            {parts.map((part) =>
              part.share > 0 ? (
                <span key={part.key} className={`stackbar__seg stackbar__seg--${part.key}`} style={{ flexGrow: part.share }} />
              ) : null,
            )}
          </div>
          <dl className="breakdown__parts">
            {parts.map((part) => (
              <div key={part.key}>
                <dt>
                  <span className={`dot dot--${part.key}`} aria-hidden="true" />
                  {part.label}
                </dt>
                <dd className="mono">{part.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* The score as a formula: base × decay × danger × safety = score. */}
        <ol className="formula" aria-label={t.breakdownTitle}>
          <li className="formula__term formula__term--base">
            <span className="formula__value mono">{b.base}</span>
            <span className="formula__label">{t.basePoints}</span>
          </li>
          {factors.map((f) => (
            <li key={f.label} className="formula__term">
              <span className="formula__op" aria-hidden="true">×</span>
              <span className="formula__value mono">{f.value}</span>
              <span className="formula__label">
                {f.label}
                {f.hint && <span className="formula__hint">{f.hint}</span>}
              </span>
            </li>
          ))}
          <li className="formula__term formula__term--total">
            <span className="formula__op" aria-hidden="true">=</span>
            <span className="formula__value mono">{b.score}</span>
            <span className="formula__label">
              {t.total}
              <LevelChip level={row.level} label={row.levelLabel} />
            </span>
          </li>
        </ol>
      </div>
    </section>
  );
}
