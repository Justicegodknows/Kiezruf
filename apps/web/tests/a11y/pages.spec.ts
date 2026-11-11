import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { FORWARD_TOKEN, mockConsole, mockForwardLinks, REPORT_ID } from '../support/console-mocks';

// Definition of Done: automated axe checks pass with no serious issues (BITV 2.0 / WCAG 2.1 AA, US-36).
// Add every new citizen and console page to this list.
// Citizen web: browse (map and list), report detail, posting, My reports, followed reports, account.
// The pages render without the API too (empty, signed-out or error states), which is what the check sees in CI.
const PAGES = ['/', '/berlin/neukoelln/be-nk-2026-0112', '/new-report', '/my-reports', '/following', '/account'];

// Console (Phase 2): signed in as a fake case worker with mocked /api/staff/* answers (tests/support/console-mocks.ts),
// so the checks see the filled queue, report detail with actions, moderation and tenants pages.
const CONSOLE_PAGES = ['/console', `/console/reports/${REPORT_ID}`, '/console/moderation', '/console/tenants'];
// Public without login: the console sign-in, and the forward link (live and expired).
const PUBLIC_PAGES = ['/console/sign-in', `/forwarded/${FORWARD_TOKEN}`, '/forwarded/expired_0123456789abcdef'];

async function expectNoSeriousIssues(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

for (const path of PAGES) {
  test(`${path} has no serious or critical accessibility issues`, async ({ page }) => {
    await page.goto(path);
    await expectNoSeriousIssues(page);
  });
}

for (const path of CONSOLE_PAGES) {
  test(`${path} (console, signed in) has no serious or critical accessibility issues`, async ({ page, context, baseURL }) => {
    await mockConsole(context, page, baseURL!);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoSeriousIssues(page);
  });
}

for (const path of PUBLIC_PAGES) {
  test(`${path} has no serious or critical accessibility issues`, async ({ page }) => {
    await mockForwardLinks(page);
    await page.route('**/api/staff/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"signedIn":false}' }));
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoSeriousIssues(page);
  });
}
