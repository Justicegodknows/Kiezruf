import { describe, expect, it } from 'vitest';
import { localizedPath } from '@/components/LanguageSwitch';
import de from './dictionaries/de';
import en from './dictionaries/en';
import { fill } from './format';

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of leaves(value, path)) out.set(k, v);
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n (US-35)', () => {
  const deLeaves = leaves(de);
  const enLeaves = leaves(en);

  it('every console and citizen string has a German and an English entry', () => {
    expect([...enLeaves.keys()].sort()).toEqual([...deLeaves.keys()].sort());
    for (const [key, value] of [...deLeaves, ...enLeaves]) expect(value.trim(), key).not.toBe('');
  });

  it('German and English strings use the same placeholders', () => {
    for (const [key, value] of deLeaves) expect(placeholders(enLeaves.get(key)!), key).toEqual(placeholders(value));
  });

  it('fills placeholders and leaves unknown ones alone', () => {
    expect(fill('{count} Meldungen', { count: 3 })).toBe('3 Meldungen');
    expect(fill('{a} {b}', { a: 1 })).toBe('1 {b}');
  });

  it('swaps only the locale segment of a path', () => {
    expect(localizedPath('/de', 'en')).toBe('/en');
    expect(localizedPath('/de/console', 'en')).toBe('/en/console');
    expect(localizedPath('/en/reports/BE-NK-2026-0112', 'de')).toBe('/de/reports/BE-NK-2026-0112');
  });
});
