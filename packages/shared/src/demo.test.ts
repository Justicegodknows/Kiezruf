import { describe, expect, it } from 'vitest';
import { getPublicReport, listPublicReports, listStaffQueue, reportIds, STATUS_ORDER } from './demo';
import { KIEZ_MAP } from './kiez-map';
import { PHOTOS } from './photos';
import { priorityScore } from './score';

describe('demo data: citizen view (US-24)', () => {
  it('never carries a score, level or danger marks', () => {
    for (const report of listPublicReports()) {
      expect(report).not.toHaveProperty('score');
      expect(report).not.toHaveProperty('level');
      expect(report).not.toHaveProperty('dangerMarks');
    }
  });

  it('is sorted by distance', () => {
    const d = listPublicReports().map((r) => r.distanceMetres);
    expect(d).toEqual([...d].sort((a, b) => a - b));
  });

  it('finds a report by id, also without staff fields', () => {
    const [id] = reportIds();
    expect(getPublicReport(id)?.id).toBe(id);
    expect(getPublicReport(id)).not.toHaveProperty('dangerMarks');
    expect(getPublicReport('BE-NK-0000-0000')).toBeUndefined();
  });

  it('has German and English text for every report', () => {
    for (const r of listPublicReports()) {
      expect(r.title.de && r.title.en).toBeTruthy();
      expect(r.description.de && r.description.en).toBeTruthy();
      expect(STATUS_ORDER).toContain(r.status);
    }
  });
});

describe('demo data: staff queue (US-22, US-23)', () => {
  const queue = listStaffQueue();

  it('leaves out resolved reports and sorts by score, highest first', () => {
    expect(queue.every((r) => r.status !== 'resolved')).toBe(true);
    expect(queue.map((r) => r.score)).toEqual([...queue.map((r) => r.score)].sort((a, b) => b - a));
  });

  it('uses the shared score, and the breakdown multiplies out to it', () => {
    for (const r of queue) {
      const { base, decay, danger, safety } = r.breakdown;
      expect(r.score).toBe(priorityScore(r));
      expect(base * decay * danger * safety).toBeCloseTo(r.score, 10);
    }
  });
});

describe('demo data: photos and support timeline', () => {
  it('gives every report a credited location photo', () => {
    for (const r of listPublicReports()) {
      const credit = PHOTOS[r.photo];
      expect(credit.author && credit.license && credit.source).toBeTruthy();
    }
  });

  it('has a rising support timeline that ends at the current Me too count', () => {
    for (const r of listPublicReports()) {
      expect(r.meTooTimeline).toHaveLength(8);
      expect(r.meTooTimeline.at(-1)).toBe(r.meToo);
      r.meTooTimeline.slice(1).forEach((v, i) => expect(v).toBeGreaterThanOrEqual(r.meTooTimeline[i]));
    }
  });

  it('places every pin inside the street diagram', () => {
    for (const r of listPublicReports()) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x).toBeLessThanOrEqual(100);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeLessThanOrEqual(100);
    }
    expect(KIEZ_MAP.labels.length).toBeGreaterThan(0);
  });
});
