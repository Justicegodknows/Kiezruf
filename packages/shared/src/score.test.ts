// US-22 (priority score) and US-23 (priority levels).
// Expected values come from the product plan: kiezruf-mvp-prototype.html, "Intelligent analysis" and the sample reports.
import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS, priorityLevel, priorityScore, scoreBreakdown, type ScoreInput } from './index';

const base: ScoreInput = { coReporters: 0, commenters: 0, meToo: 0, ageHours: 0, dangerMarks: 0, safetyCategory: false };
const score = (over: Partial<ScoreInput>) => priorityScore({ ...base, ...over });

describe('priorityScore weights (US-22)', () => {
  it.each([
    ['co-reporter', { coReporters: 1 }, 5],
    ['commenter', { commenters: 1 }, 2],
    ['Me too vote', { meToo: 1 }, 1],
  ])('counts one %s as %i points', (_label, input, points) => {
    expect(score(input)).toBe(points);
  });

  it('adds the weighted parts', () => {
    expect(score({ coReporters: 4, commenters: 5, meToo: 20 })).toBe(50);
  });

  it('is 0 for a report nobody interacted with', () => {
    expect(score({ ageHours: 1, dangerMarks: 3, safetyCategory: true })).toBe(0);
  });
});

describe('recency decay (half-life 14 days)', () => {
  it('does not decay a brand-new report', () => {
    expect(score({ meToo: 10 })).toBe(10);
  });

  it.each([
    [14 * 24, 0.5],
    [28 * 24, 0.25],
    [7 * 24, Math.SQRT1_2],
  ])('after %i hours keeps a factor of %f', (ageHours, factor) => {
    expect(score({ meToo: 100, ageHours })).toBeCloseTo(100 * factor, 10);
  });

  it('never increases with age', () => {
    const ages = [0, 1, 24, 72, 336, 1000];
    const values = ages.map((ageHours) => score({ meToo: 50, ageHours }));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThan(values[i - 1]);
  });
});

describe('multipliers', () => {
  it.each([
    [0, 1],
    [1, 1.2],
    [2, 1.2],
    [3, 1.5],
    [10, 1.5],
  ])('%i danger marks multiply by %f', (dangerMarks, factor) => {
    expect(score({ meToo: 10, dangerMarks })).toBeCloseTo(10 * factor, 10);
  });

  it('multiplies a safety category by 1.3', () => {
    expect(score({ meToo: 10, safetyCategory: true })).toBeCloseTo(13, 10);
  });

  it('combines danger and safety multipliers', () => {
    expect(score({ meToo: 10, dangerMarks: 3, safetyCategory: true })).toBeCloseTo(19.5, 10);
  });
});

describe('priorityLevel thresholds (US-23)', () => {
  it('uses the plan defaults: Critical ≥ 60, High ≥ 25, Medium ≥ 10', () => {
    expect(DEFAULT_THRESHOLDS).toEqual({ Critical: 60, High: 25, Medium: 10 });
  });

  it.each([
    [0, 'Low'],
    [9.99, 'Low'],
    [10, 'Medium'],
    [24.99, 'Medium'],
    [25, 'High'],
    [59.99, 'High'],
    [60, 'Critical'],
    [500, 'Critical'],
  ] as const)('score %f is %s', (value, level) => {
    expect(priorityLevel(value)).toBe(level);
  });

  it('accepts per-tenant thresholds', () => {
    const strict = { Critical: 100, High: 50, Medium: 20 };
    expect(priorityLevel(60, strict)).toBe('High');
    expect(priorityLevel(19, strict)).toBe('Low');
  });
});

describe('sample reports from the prototype', () => {
  // [title, input, expected score (1 dp), expected level]
  const samples: [string, ScoreInput, number, string][] = [
    ['Pedestrian light not working', { coReporters: 4, commenters: 5, meToo: 20, ageHours: 2, dangerMarks: 3, safetyCategory: true }, 97.1, 'Critical'],
    ['Deep pothole in the bike lane', { coReporters: 3, commenters: 2, meToo: 11, ageHours: 24, dangerMarks: 1, safetyCategory: true }, 44.5, 'High'],
    ['Rubbish dumped again at Hermannplatz', { coReporters: 5, commenters: 3, meToo: 14, ageHours: 12, dangerMarks: 0, safetyCategory: false }, 43.9, 'High'],
    ['Swing seat broken at playground', { coReporters: 2, commenters: 1, meToo: 2, ageHours: 48, dangerMarks: 0, safetyCategory: true }, 16.5, 'Medium'],
    ['Bike lane blocked by parked van', { coReporters: 1, commenters: 0, meToo: 3, ageHours: 5, dangerMarks: 0, safetyCategory: false }, 7.9, 'Low'],
  ];

  it.each(samples)('%s scores %f', (_title, input, expected) => {
    expect(Number(priorityScore(input).toFixed(1))).toBe(expected);
  });

  it.each(samples)('%s is level %s', (_title, input, _expected, level) => {
    expect(priorityLevel(priorityScore(input))).toBe(level);
  });

  it('drops the youth-centre door to Medium once 15 new-account votes count at half weight (US-26)', () => {
    const door = { coReporters: 1, commenters: 1, ageHours: 72, dangerMarks: 0, safetyCategory: false };
    expect(priorityLevel(priorityScore({ ...door, meToo: 26 }))).toBe('High');
    expect(priorityLevel(priorityScore({ ...door, meToo: 26 - 15 / 2 }))).toBe('Medium');
  });
});

describe('scoreBreakdown (US-24 breakdown panel)', () => {
  it('lists each weighted part and every multiplier', () => {
    expect(scoreBreakdown({ coReporters: 4, commenters: 5, meToo: 20, ageHours: 0, dangerMarks: 3, safetyCategory: true })).toEqual({
      coReporterPoints: 20,
      commenterPoints: 10,
      meTooPoints: 20,
      base: 50,
      decay: 1,
      danger: 1.5,
      safety: 1.3,
      score: 50 * 1.5 * 1.3,
    });
  });
});
