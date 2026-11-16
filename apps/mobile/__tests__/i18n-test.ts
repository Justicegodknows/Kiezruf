// German and English are complete and consistent (US-35).
import { CATEGORY_KEYS } from '@kiezruf/shared';
import { REPORT_STATUSES } from '../src/api/schemas';
import { de } from '../src/i18n/de';
import { en } from '../src/i18n/en';
import i18n from '../src/i18n';

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((out, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'string' ? { ...out, [key]: v } : { ...out, ...flatten(v, key) };
  }, {});
}

const flatDe = flatten(de as unknown as Tree);
const flatEn = flatten(en as unknown as Tree);
const vars = (s: string) => [...s.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();

test('both languages have exactly the same keys', () => {
  expect(Object.keys(flatEn).sort()).toEqual(Object.keys(flatDe).sort());
});

test('no translation is empty', () => {
  for (const [key, text] of [...Object.entries(flatDe), ...Object.entries(flatEn)]) expect([key, text.trim().length > 0]).toEqual([key, true]);
});

test('placeholders match between languages', () => {
  for (const key of Object.keys(flatDe)) expect([key, vars(flatEn[key]!)]).toEqual([key, vars(flatDe[key]!)]);
});

test('every category and status has a name', () => {
  for (const key of CATEGORY_KEYS) {
    expect(flatDe[`categories.${key}`]).toBeTruthy();
    expect(flatEn[`categories.${key}`]).toBeTruthy();
  }
  for (const status of REPORT_STATUSES) {
    expect(flatDe[`status.${status}`]).toBeTruthy();
    expect(flatEn[`status.${status}`]).toBeTruthy();
  }
});

test('German is the default language', () => {
  expect(i18n.language).toBe('de');
  expect(i18n.t('notLive.notify')).toBe('Sag mir Bescheid, wenn es hier losgeht');
});

test('plurals resolve in both languages', async () => {
  expect(i18n.t('time.hoursAgo', { count: 1 })).toBe('vor 1 Stunde');
  expect(i18n.t('time.hoursAgo', { count: 3 })).toBe('vor 3 Stunden');
  await i18n.changeLanguage('en');
  expect(i18n.t('time.daysAgo', { count: 2 })).toBe('2 days ago');
  await i18n.changeLanguage('de');
});
