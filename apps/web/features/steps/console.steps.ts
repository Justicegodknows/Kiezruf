import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { mockConsole } from '../../tests/support/console-mocks';

const { Given, When, Then } = createBdd();

// score-breakdown.feature. The console renders in the browser from this site's /api routes, so the steps sign in
// a fake case worker and serve the staff API from fixtures (tests/support/console-mocks.ts): no Kiezruf API needed.
// The feature stays @wip until these steps have run once in a real browser (see PROGRESS.md).

Given('I am a case worker assigned to {string}', async ({ page, context, baseURL }, tenant: string) => {
  await mockConsole(context, page, baseURL!, tenant);
});

When('I open {string} in the console', async ({ page }, id: string) => {
  await page.goto(`/console/reports/${id}`);
});

Then('I see the base points, decay, danger and safety multipliers', async ({ page }) => {
  const panel = page.getByTestId('score-breakdown');
  await expect(panel).toBeVisible();
  for (const factor of ['base', 'decay', 'danger', 'safety', 'score']) {
    await expect(panel.locator(`[data-factor="${factor}"]`)).toHaveText(/\d/);
  }
});

Then('their product equals the shown score', async ({ page }) => {
  const panel = page.getByTestId('score-breakdown');
  // The console is German by default: "0,99588" → 0.99588.
  const read = async (factor: string) => Number((await panel.locator(`[data-factor="${factor}"]`).innerText()).replace(/\./g, '').replace(',', '.'));
  const product = (await read('base')) * (await read('decay')) * (await read('danger')) * (await read('safety'));
  const score = await read('score');
  expect(Math.round(product * 10) / 10).toBe(score);
});
