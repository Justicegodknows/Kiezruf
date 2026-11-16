import { describe, expect, it } from 'vitest';
import {
  detectSpike,
  forwardLinkExpired,
  isSafetyCategory,
  meTooWeight,
  priorityScore,
  scoreBreakdown,
  validThresholds,
  type Vote,
} from './index';

const T0 = new Date('2026-11-11T10:00:00Z');
const minutes = (m: number) => new Date(T0.getTime() + m * 60_000);
const daysBefore = (at: Date, d: number) => new Date(at.getTime() - d * 86_400_000);

/** `total` votes spread over `spanMinutes`; the first `fresh` come from accounts 1 day old, the rest from 30-day-old ones. */
function votes(total: number, fresh: number, spanMinutes: number): Vote[] {
  return Array.from({ length: total }, (_, i) => {
    const at = minutes(total > 1 ? (i * spanMinutes) / (total - 1) : 0);
    return { accountId: `a${i}`, at, accountCreatedAt: daysBefore(at, i < fresh ? 1 : 30) };
  });
}

describe('spike detection (US-26, US-37)', () => {
  it('flags 19 votes in 40 min when 15 come from accounts younger than 7 days', () => {
    expect(detectSpike(votes(19, 15, 40))).toBe(true);
  });

  it('does not flag 19 votes in 40 min when only 4 come from new accounts', () => {
    expect(detectSpike(votes(19, 4, 40))).toBe(false);
  });

  it('does not flag 10 votes in 60 min (the rule needs more than 10)', () => {
    expect(detectSpike(votes(10, 10, 60))).toBe(false);
    expect(detectSpike(votes(11, 11, 60))).toBe(true);
  });

  it('does not flag 11 new-account votes spread over more than 60 minutes', () => {
    expect(detectSpike(votes(11, 11, 120))).toBe(false);
  });

  it('needs over half from new accounts, not exactly half', () => {
    // 11 votes in the window: 5 new is under half, 6 new is over half.
    expect(detectSpike(votes(11, 5, 30))).toBe(false);
    expect(detectSpike(votes(11, 6, 30))).toBe(true);
  });

  it('counts flagged new-account votes at half weight', () => {
    const v = votes(19, 15, 40);
    expect(meTooWeight(v, false)).toBe(19);
    expect(meTooWeight(v, true)).toBe(4 + 15 * 0.5);
  });

  it('counts each account once per report, after duplicates are merged (US-17)', () => {
    const v = votes(3, 0, 10);
    const twice = [...v, { ...v[0]!, at: minutes(50) }];
    expect(meTooWeight(twice, false)).toBe(3);
    expect(detectSpike([...votes(11, 11, 30), ...votes(11, 11, 30)])).toBe(true);
  });

  it('judges an account by its age when it voted, not today', () => {
    const at = minutes(0);
    const vote = { accountId: 'x', at, accountCreatedAt: daysBefore(at, 6.9) };
    expect(meTooWeight([vote], true)).toBe(0.5);
    expect(meTooWeight([{ ...vote, accountCreatedAt: daysBefore(at, 7) }], true)).toBe(1);
  });
});

describe('score breakdown (US-22)', () => {
  it('multiplies to the score', () => {
    const b = scoreBreakdown({ coReporters: 4, commenters: 5, meToo: 20, ageHours: 2, dangerMarks: 3, safetyCategory: true });
    expect(b.base).toBe(50);
    expect(b.dangerMultiplier).toBe(1.5);
    expect(b.safetyMultiplier).toBe(1.3);
    expect(b.score).toBeCloseTo(b.base * b.decay * b.dangerMultiplier * b.safetyMultiplier, 10);
    expect(b.score).toBe(priorityScore(b));
  });
});

describe('safety categories (US-22)', () => {
  it('marks the safety-relevant categories from the product plan', () => {
    expect(['traffic_light', 'pothole', 'road_sign', 'street_lighting', 'playground'].every(isSafetyCategory)).toBe(true);
    expect(['bike_lane', 'waste_bins', 'illegal_dumping', 'nonsense'].some(isSafetyCategory)).toBe(false);
  });
});

describe('thresholds (US-23)', () => {
  it('accepts falling positive thresholds only', () => {
    expect(validThresholds({ Critical: 60, High: 25, Medium: 10 })).toBe(true);
    expect(validThresholds({ Critical: 25, High: 25, Medium: 10 })).toBe(false);
    expect(validThresholds({ Critical: 60, High: 25, Medium: 0 })).toBe(false);
  });
});

describe('forward links (US-45)', () => {
  it('expires the link after 90 days', () => {
    expect(forwardLinkExpired(daysBefore(T0, 90), T0)).toBe(false);
    expect(forwardLinkExpired(daysBefore(T0, 91), T0)).toBe(true);
  });
});
