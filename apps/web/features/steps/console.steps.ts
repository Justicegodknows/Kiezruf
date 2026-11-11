import { createBdd } from 'playwright-bdd';

const { Given, When, Then } = createBdd();

// Placeholders until the console exists. The feature is tagged @wip, so these do not run in CI yet.
const notBuilt = (what: string) => {
  throw new Error(`Not built yet: ${what}`);
};

Given('I am a case worker assigned to {string}', async ({ page }, tenant: string) => {
  void page;
  notBuilt(`sign-in as a case worker for ${tenant}`);
});

When('I open {string} in the console', async ({ page }, id: string) => {
  await page.goto(`/console/reports/${id}`);
});

Then('I see the base points, decay, danger and safety multipliers', async () => {
  notBuilt('score breakdown panel');
});

Then('their product equals the shown score', async () => {
  notBuilt('score breakdown panel');
});
