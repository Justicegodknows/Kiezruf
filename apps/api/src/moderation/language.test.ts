import { describe, expect, it } from 'vitest';
import { needsReview } from './language.js';

describe('offensive-language filter (US-19)', () => {
  it.each([
    'Du Arschloch',
    'So ein DRECKSARSCHLOCH hier',
    'fuck this',
    'f.u.c.k this',
    'Wichs3r',
    'Scheißkerl',
    'Hurens0hn',
  ])('holds %j', (text) => {
    expect(needsReview(text)).toBe(true);
  });

  it.each([
    'Die Ampel an der Karl-Marx-Straße ist seit heute Morgen aus.',
    'Kinder aus der Schule queren hier um 8.',
    'Same on the other side of the street.',
    'Ficus im Park umgekippt',
    'Spandauer Damm, Höhe Nr. 3',
  ])('lets %j through', (text) => {
    expect(needsReview(text)).toBe(false);
  });

  // Long terms also match inside compounds, so a harmless compound can be held. That only delays the comment
  // until staff release it; it is the accepted price for catching "Drecksarschloch" and the like.
  it('holds a harmless compound that contains a long term (accepted false positive)', () => {
    expect(needsReview('Bitchumer Straße')).toBe(true);
  });
});
