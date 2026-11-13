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
                <td>
                  <LevelChip level={r.level} label={r.levelLabel} />
                </td>
                <td className="num mono">{r.score}</td>
                <td className="hide-sm">
                  <StatusBadge status={r.status} label={r.statusLabel} />
                </td>
                <td className="num hide-sm muted">{r.age}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <aside className="breakdown card" aria-live="polite" aria-labelledby="breakdown-title">
          <div className="breakdown__head">
            <p className="eyebrow">
              <Icon name="lock" size={14} /> {t.staffOnly}
            </p>
            <h3 id="breakdown-title">{t.breakdownTitle}</h3>
            <p className="breakdown__report">{selected.title}</p>
            <p className="muted small">
              {t.reference} <span className="mono">{selected.id}</span>
            </p>
          </div>
          <dl className="breakdown__list">
            <div>
              <dt>{t.coReportersTimes}</dt>
              <dd className="mono">{selected.breakdown.coReporters}</dd>
            </div>
            <div>
              <dt>{t.commentersTimes}</dt>
              <dd className="mono">{selected.breakdown.commenters}</dd>
            </div>
            <div>
              <dt>{t.meTooTimes}</dt>
              <dd className="mono">{selected.breakdown.meToo}</dd>
            </div>
            <div className="breakdown__subtotal">
              <dt>{t.basePoints}</dt>
              <dd className="mono">{selected.breakdown.base}</dd>
            </div>
            <div>
              <dt>
                {t.decay} <span className="muted small">({t.decayHint})</span>
              </dt>
              <dd className="mono">× {selected.breakdown.decay}</dd>
            </div>
            <div>
              <dt>{t.danger}</dt>
              <dd className="mono">× {selected.breakdown.danger}</dd>
            </div>
            <div>
              <dt>{t.safety}</dt>
              <dd className="mono">× {selected.breakdown.safety}</dd>
            </div>
            <div className="breakdown__total">
              <dt>{t.total}</dt>
              <dd>
                <span className="mono">{selected.breakdown.score}</span>
                <LevelChip level={selected.level} label={selected.levelLabel} />
              </dd>
            </div>
          </dl>
        </aside>
      )}
    </div>
  );
}
