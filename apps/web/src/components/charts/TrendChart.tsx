'use client';

import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Icon } from '../Icon';

export interface TrendPoint {
  label: string;
  received: number;
  resolved: number;
}

// Two series on one axis (same unit). Colours are categorical slots 1 and 2, defined as tokens
// in globals.css for both themes. Legend plus end labels, so identity is never colour alone.
export function TrendChart({
  data,
  receivedLabel,
  resolvedLabel,
  tableLabel,
  chartLabel,
  caption,
}: {
  data: TrendPoint[];
  receivedLabel: string;
  resolvedLabel: string;
  tableLabel: string;
  chartLabel: string;
  caption: string;
}) {
  const [asTable, setAsTable] = useState(false);

  return (
    <div className="viz">
      <div className="viz__bar">
        <ul className="legend">
          <li>
            <span className="legend__swatch" style={{ background: 'var(--series-1)' }} />
            {receivedLabel}
          </li>
          <li>
            <span className="legend__swatch legend__swatch--dashed" style={{ borderColor: 'var(--series-2)' }} />
            {resolvedLabel}
          </li>
        </ul>
        <button type="button" className="button button--ghost button--sm" onClick={() => setAsTable((v) => !v)}>
          <Icon name={asTable ? 'chart' : 'table'} size={16} />
          {asTable ? chartLabel : tableLabel}
        </button>
      </div>

      {asTable ? (
        <table className="data-table data-table--compact">
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col" className="num">{receivedLabel}</th>
              <th scope="col" className="num">{resolvedLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <th scope="row">{d.label}</th>
                <td className="num">{d.received}</td>
                <td className="num">{d.resolved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="viz__plot" role="img" aria-label={caption}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: 'var(--line)' }}
                tick={{ fill: 'var(--muted)', fontSize: 12 }}
                dy={6}
              />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} width={44} />
              <Tooltip
                cursor={{ stroke: 'var(--line-strong)', strokeWidth: 1 }}
                contentStyle={{
                  background: 'var(--surface-raised)',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  boxShadow: 'var(--shadow-md)',
                  color: 'var(--ink)',
                  fontSize: 13,
                }}
                labelStyle={{ color: 'var(--muted)', marginBottom: 4 }}
                itemStyle={{ color: 'var(--ink)', padding: 0 }}
              />
              <Line
                type="monotone"
                dataKey="received"
                name={receivedLabel}
                stroke="var(--series-1)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="resolved"
                name={resolvedLabel}
                stroke="var(--series-2)"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
