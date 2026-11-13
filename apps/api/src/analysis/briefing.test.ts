import { describe, expect, it } from 'vitest';
import { briefingMail, weekStartOf } from './briefing.js';

describe('weekStartOf', () => {
  it('is the Monday of the week in Berlin', () => {
    expect(weekStartOf(new Date('2026-11-16T05:00:00Z'))).toBe('2026-11-16'); // Monday 06:00 CET
    expect(weekStartOf(new Date('2026-11-22T22:30:00Z'))).toBe('2026-11-16'); // Sunday 23:30 CET
    expect(weekStartOf(new Date('2026-11-22T23:30:00Z'))).toBe('2026-11-23'); // already Monday in Berlin
  });
});

describe('briefingMail (US-56)', () => {
  it('lists items with levels and console links, labelled AI-written', () => {
    const mail = briefingMail('Neukölln', '2026-11-16', { aiWritten: true, fallback: false }, [
      { level: 'Critical', kind: 'Urgent', headline: 'Ampel aus', text: 'Kinder queren um 8.', citations: ['BE-NK-2026-0112'] },
    ], 'https://kiezruf.test');
    expect(mail.subject).toBe('Kiezruf-Wochenbriefing Neukölln (2026-11-16)');
    expect(mail.text).toContain('KI-erstellt');
    expect(mail.text).toContain('1. [Kritisch · Dringend] Ampel aus');
    expect(mail.text).toContain('BE-NK-2026-0112: https://kiezruf.test/console/reports/BE-NK-2026-0112');
  });
});
