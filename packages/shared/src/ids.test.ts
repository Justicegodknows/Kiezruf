import { describe, expect, it } from 'vitest';
import { berlinYear, formatReportId, parseReportId, REPORT_ID_PATTERN } from './index';

describe('report IDs (US-41)', () => {
  it('formats as <Land>-<tenant>-<year>-<4-digit sequence>, e.g. BE-NK-2026-0118', () => {
    expect(formatReportId({ land: 'BE', tenant: 'NK', year: 2026, sequence: 118 })).toBe('BE-NK-2026-0118');
  });

  it('pads the sequence to 4 digits', () => {
    expect(formatReportId({ land: 'BE', tenant: 'SP', year: 2026, sequence: 1 })).toBe('BE-SP-2026-0001');
    expect(formatReportId({ land: 'BE', tenant: 'SP', year: 2026, sequence: 9999 })).toBe('BE-SP-2026-9999');
  });

  it('upper-cases the codes', () => {
    expect(formatReportId({ land: 'be', tenant: 'nk', year: 2026, sequence: 7 })).toBe('BE-NK-2026-0007');
  });

  it.each([0, 10000, 1.5, -1])('rejects sequence %d', (sequence) => {
    expect(() => formatReportId({ land: 'BE', tenant: 'NK', year: 2026, sequence })).toThrow(RangeError);
  });

  it('rejects codes that do not fit the pattern', () => {
    expect(() => formatReportId({ land: 'BER', tenant: 'NK', year: 2026, sequence: 1 })).toThrow(RangeError);
    expect(() => formatReportId({ land: 'BE', tenant: 'N-K', year: 2026, sequence: 1 })).toThrow(RangeError);
    expect(() => formatReportId({ land: 'BE', tenant: 'NK', year: 99, sequence: 1 })).toThrow(RangeError);
  });

  it('parses an ID back into its parts', () => {
    expect(parseReportId('BE-NK-2026-0118')).toEqual({ land: 'BE', tenant: 'NK', year: 2026, sequence: 118 });
  });

  it.each(['BE-NK-2026-118', 'be-nk-2026-0118', 'BE-NK-2026-0118 ', "BE-NK-2026-0118'--", ''])('does not parse %j', (id) => {
    expect(parseReportId(id)).toBeNull();
    expect(REPORT_ID_PATTERN.test(id)).toBe(false);
  });

  it('takes the year in Berlin time', () => {
    // 23:30 UTC on 31 December is already New Year in Berlin.
    expect(berlinYear(new Date('2026-12-31T23:30:00Z'))).toBe(2027);
    expect(berlinYear(new Date('2026-12-31T22:30:00Z'))).toBe(2026);
  });
});
