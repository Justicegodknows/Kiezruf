import { describe, expect, it } from 'vitest';
import { categoryGroup, fallbackBriefing, pseudonymise, validateBriefing } from './index';

const item = (citations: string[], over: Record<string, unknown> = {}) => ({
  level: 'High', kind: 'Urgent', headline: 'Pedestrian light dark', text: 'Children cross here at 8.', citations, ...over,
});
const scope = new Set(['BE-NK-2026-0112', 'BE-NK-2026-0109', 'BE-NK-2026-0101']);

describe('briefing validation (US-53)', () => {
  it('keeps at most 5 items', () => {
    const result = validateBriefing({ items: Array.from({ length: 7 }, () => item(['BE-NK-2026-0112'])) }, scope);
    expect(result.items).toHaveLength(5);
    expect(result.dropped.filter((d) => d.reason === 'over_limit')).toHaveLength(2);
  });

  it('drops an item that cites a report outside the tenant scope', () => {
    const result = validateBriefing({ items: [item(['BE-NK-2026-0112', 'BE-SP-2026-0233']), item(['BE-NK-2026-0109'])] }, scope);
    expect(result.items.map((i) => i.citations)).toEqual([['BE-NK-2026-0109']]);
    expect(result.dropped).toEqual([{ index: 0, reason: 'citation_out_of_scope' }]);
  });

  it('drops an item with no citations', () => {
    expect(validateBriefing({ items: [item([])] }, scope).dropped).toEqual([{ index: 0, reason: 'no_citations' }]);
  });

  it('drops malformed items and survives a malformed answer', () => {
    expect(validateBriefing({ items: [item(['BE-NK-2026-0112'], { kind: 'Panic' }), item(['BE-NK-2026-0112'], { headline: ' ' })] }, scope).items).toEqual([]);
    expect(validateBriefing('not json', scope).items).toEqual([]);
    expect(validateBriefing(null, scope).items).toEqual([]);
  });

  it('labels every briefing as AI-written, except the fallback', () => {
    expect(validateBriefing({ items: [item(['BE-NK-2026-0112'])] }, scope)).toMatchObject({ aiWritten: true, fallback: false });
    const fallback = fallbackBriefing([{ publicId: 'BE-NK-2026-0112', level: 'Critical', category: 'traffic_light' }]);
    expect(fallback).toMatchObject({ aiWritten: false, fallback: true });
    expect(fallback.items[0]).toMatchObject({ kind: 'Urgent', citations: ['BE-NK-2026-0112'] });
  });

  it('removes duplicate citations', () => {
    expect(validateBriefing({ items: [item(['BE-NK-2026-0112', 'BE-NK-2026-0112'])] }, scope).items[0]!.citations).toEqual(['BE-NK-2026-0112']);
  });
});

describe('pseudonymisation before AI calls (D-13)', () => {
  it('removes German phone numbers such as "0171 1234567" and "+49 30 1234567"', () => {
    expect(pseudonymise('Ruf an: 0171 1234567')).toBe('Ruf an: [Telefon]');
    expect(pseudonymise('Tel. +49 30 1234567, danke')).toBe('Tel. [Telefon], danke');
    expect(pseudonymise('030/123 45 67')).toBe('[Telefon]');
  });

  it('removes email addresses', () => {
    expect(pseudonymise('Schreibt an anna.schmidt@example.org bitte')).toBe('Schreibt an [E-Mail] bitte');
  });

  it('removes first names that address a person, e.g. "Call me, Anna"', () => {
    expect(pseudonymise('Call me, Anna, on 0171 1234567')).toBe('Call me, [Name], on [Telefon]');
    expect(pseudonymise('Viele Grüße, Kowalczyk')).toBe('Viele Grüße, [Name]');
    expect(pseudonymise('Mehmet sagt, die Ampel ist seit Montag aus.')).toBe('[Name] sagt, die Ampel ist seit Montag aus.');
  });

  it('leaves street names and place names intact, e.g. "Karl-Marx-Straße"', () => {
    for (const text of [
      'Die Ampel an der Karl-Marx-Straße 100 ist aus.',
      'Am Hermannplatz liegt Müll.',
      'Paul Lincke Ufer ist gesperrt.',
      'Rathaus Neukölln, Höhe Haltestelle.',
      'Seit dem 11.11.2026 kaputt.',
    ]) {
      expect(pseudonymise(text)).toBe(text);
    }
  });

  it('keeps house numbers and times', () => {
    expect(pseudonymise('Nr. 100, um 08:15 Uhr')).toBe('Nr. 100, um 08:15 Uhr');
  });
});

describe('category groups', () => {
  it('names the group of a category', () => {
    expect(categoryGroup('pothole')).toBe('traffic');
    expect(categoryGroup('waste_bins')).toBe('community');
    expect(categoryGroup('nonsense')).toBeUndefined();
  });
});
