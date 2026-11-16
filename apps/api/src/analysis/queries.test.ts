import { describe, expect, it } from 'vitest';
import { toCsv, weekdayPattern } from './queries.js';

describe('weekdayPattern (US-52)', () => {
  const monday = (week: number) => new Date(Date.UTC(2026, 10, 2 + week * 7, 9));
  it('says "mostly Mondays" when more than half fall on a Monday', () => {
    expect(weekdayPattern([monday(0), monday(1), new Date(Date.UTC(2026, 10, 4, 9))])).toBe('mon');
  });
  it('has no pattern below 3 reports or without a majority', () => {
    expect(weekdayPattern([monday(0), monday(1)])).toBeNull();
    expect(weekdayPattern([monday(0), new Date(Date.UTC(2026, 10, 3, 9)), new Date(Date.UTC(2026, 10, 4, 9))])).toBeNull();
  });
  it('uses Berlin time: 23:30 UTC on a Sunday is already Monday', () => {
    const late = (d: number) => new Date(Date.UTC(2026, 10, d, 23, 30));
    expect(weekdayPattern([late(1), late(8), late(15)])).toBe('mon');
  });
});

describe('toCsv (US-55)', () => {
  it('quotes commas, quotes and line breaks, and defuses formulas', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'say "hi"'], ['=SUM(A1)', null]])).toBe('a,b\r\n"x,y","say ""hi"""\r\n\'=SUM(A1),\r\n');
  });
});
