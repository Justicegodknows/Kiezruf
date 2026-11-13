import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Definition of Done: automated axe checks pass with no serious issues (BITV 2.0 / WCAG 2.1 AA, US-36).
// Add every new citizen and console page to this list.
const PAGES = [
  '/de',
  '/en',
  '/de/console',
  '/en/console',
  '/de/reports/BE-NK-2026-0112',
  '/en/reports/BE-NK-2026-0101',
  '/de/credits',
];
const THEMES = ['light', 'dark'] as const;

for (const theme of THEMES) for (const path of PAGES) {
  test(`${path} (${theme}) has no serious or critical accessibility issues`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}
