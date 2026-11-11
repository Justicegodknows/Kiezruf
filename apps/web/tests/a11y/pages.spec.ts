import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Definition of Done: automated axe checks pass with no serious issues (BITV 2.0 / WCAG 2.1 AA, US-36).
// Add every new citizen and console page to this list.
// Citizen web: browse (map and list), report detail, posting, My reports, followed reports, account.
// The pages render without the API too (empty, signed-out or error states), which is what the check sees in CI.
const PAGES = ['/', '/berlin/neukoelln/be-nk-2026-0112', '/new-report', '/my-reports', '/following', '/account'];

for (const path of PAGES) {
  test(`${path} has no serious or critical accessibility issues`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}
