'use client';

// Score breakdown for staff (US-22, US-24): base points from unique accounts (co-reporters × 5, commenters × 2,
// Me too × 1), then recency decay, danger and safety multipliers. The last line multiplies the shown factors,
// so staff can check that they give the shown score. The numbers come from the API; nothing is recomputed here.
import { useId } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { decayDigits, formatAge, formatCount, formatFactor, formatScore } from '../format';
import type { Breakdown } from '../types';

export function ScoreBreakdown({ breakdown }: { breakdown: Breakdown }) {
  const { t, locale } = useI18n();
  const headingId = useId();
  const b = breakdown;
  const count = (n: number) => formatCount(locale, n);
  const factor = (n: number) => formatFactor(locale, n);
  const decay = formatFactor(locale, b.decay, decayDigits(b.base, b.dangerMultiplier * b.safetyMultiplier));

  return (
    <section className="panel breakdown" aria-labelledby={headingId} data-testid="score-breakdown">
      <h2 id={headingId}>{t('console.breakdown.title')}</h2>
      <table className="breakdown-table">
        <caption className="visually-hidden">{t('console.breakdown.caption')}</caption>
        <tbody>
          <tr>
            <th scope="row">{t('console.breakdown.coReporters', { count: count(b.coReporters) })}</th>
            <td className="num">{count(b.coReporters * 5)}</td>
          </tr>
          <tr>
            <th scope="row">{t('console.breakdown.commenters', { count: count(b.commenters) })}</th>
            <td className="num">{count(b.commenters * 2)}</td>
          </tr>
          <tr>
            <th scope="row">
              {t('console.breakdown.meToo', { count: count(b.meToo) })}
              {b.discountedVotes ? <span className="muted"> {t('console.breakdown.discounted', { count: count(b.discountedVotes) })}</span> : null}
            </th>
            <td className="num">{count(b.meToo)}</td>
          </tr>
          <tr className="subtotal">
            <th scope="row">{t('console.breakdown.base')}</th>
            <td className="num" data-factor="base">
              {count(b.base)}
            </td>
          </tr>
          <tr>
            <th scope="row">{t('console.breakdown.decay', { age: formatAge(t, locale, b.ageHours) })}</th>
            <td className="num">
              <span aria-hidden="true">× </span>
              <span data-factor="decay">{decay}</span>
            </td>
          </tr>
          <tr>
            <th scope="row">{b.dangerMarks > 0 ? t('console.breakdown.danger', { count: count(b.dangerMarks) }) : t('console.breakdown.noDanger')}</th>
            <td className="num">
              <span aria-hidden="true">× </span>
              <span data-factor="danger">{factor(b.dangerMultiplier)}</span>
            </td>
          </tr>
          <tr>
            <th scope="row">{b.safetyCategory ? t('console.breakdown.safety') : t('console.breakdown.noSafety')}</th>
            <td className="num">
              <span aria-hidden="true">× </span>
              <span data-factor="safety">{factor(b.safetyMultiplier)}</span>
            </td>
          </tr>
          <tr className="total">
            <th scope="row">{t('console.breakdown.score')}</th>
            <td className="num" data-factor="score">
              {formatScore(locale, b.score)}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="small mono" data-testid="breakdown-formula">
        {t('console.breakdown.formula', {
          base: count(b.base),
          decay,
          danger: factor(b.dangerMultiplier),
          safety: factor(b.safetyMultiplier),
          score: formatScore(locale, b.score),
        })}
      </p>
      <p className="small muted">{t('console.breakdown.rules')}</p>
    </section>
  );
}
