import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

// Gherkin features for the citizen web and the console. `bddgen` turns them into Playwright specs in .features-gen/.
// @wip features are skipped until their story is built.
const featuresDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: 'features/steps/**/*.ts',
  tags: 'not @wip',
});

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure', locale: 'de-DE', timezoneId: 'Europe/Berlin' },
  projects: [
    { name: 'features', testDir: featuresDir, use: { ...devices['Desktop Chrome'] } },
    { name: 'a11y', testDir: 'tests/a11y', use: { ...devices['Desktop Chrome'] } },
  ],
  // Starts the app unless BASE_URL points at a running one (e.g. staging).
  webServer: process.env.BASE_URL
    ? undefined
    : { command: `pnpm dev --port ${PORT}`, url: baseURL, reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
