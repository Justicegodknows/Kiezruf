import de from '@/i18n/de';
import en from '@/i18n/en';
import { formatAge, formatDistance } from '@/i18n/format';

type Tree = { [key: string]: string | Tree };
const leaves = (tree: Tree, prefix = ''): [string, string][] =>
  Object.entries(tree).flatMap(([k, v]) => (typeof v === 'string' ? [[prefix + k, v] as [string, string]] : leaves(v, `${prefix}${k}.`)));
const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

describe('mobile i18n (US-35)', () => {
  test('German and English have the same keys and placeholders', () => {
    const d = new Map(leaves(de));
    const e = new Map(leaves(en));
    expect([...e.keys()].sort()).toEqual([...d.keys()].sort());
    for (const [k, v] of d) expect([k, placeholders(e.get(k)!)]).toEqual([k, placeholders(v)]);
  });

  test('formats ages and distances per language', () => {
    expect(formatAge(2, 'de')).toBe('vor 2 Std.');
    expect(formatAge(26, 'en')).toBe('yesterday');
    expect(formatAge(96, 'de')).toBe('vor 4 Tagen');
    expect(formatAge(0.2, 'en')).toBe('12 min ago');
    expect(formatDistance(80, 'de')).toBe('80 m');
    expect(formatDistance(1200, 'de')).toBe('1,2 km');
  });
});
