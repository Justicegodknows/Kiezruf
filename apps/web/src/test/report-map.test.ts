// The browse map's first view fits the reports (reportBounds), so the pins are in sight on any screen.
import { describe, expect, it } from 'vitest';
import { reportBounds } from '@/components/ReportMap';

describe('reportBounds', () => {
  it('spans every report, south-west to north-east as [lon, lat]', () => {
    const neukoelln = { lat: 52.4812, lon: 13.4352 };
    const spandau = { lat: 52.5372, lon: 13.2063 };
    const rudow = { lat: 52.418, lon: 13.497 };
    expect(reportBounds([neukoelln, spandau, rudow])).toEqual([
      [13.2063, 52.418],
      [13.497, 52.5372],
    ]);
  });

  it('is a point for one report and null for none', () => {
    expect(reportBounds([{ lat: 52.5, lon: 13.4 }])).toEqual([
      [13.4, 52.5],
      [13.4, 52.5],
    ]);
    expect(reportBounds([])).toBeNull();
  });
});
