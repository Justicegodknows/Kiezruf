// cucumber-js config. TypeScript steps load through tsx (see the test:features scripts).
const base = {
  paths: ['features/**/*.feature'],
  import: ['features/support/**/*.ts', 'features/step_definitions/**/*.ts'],
  format: ['progress', 'html:reports/cucumber.html'],
};

// CI: every feature whose story is built (no @wip tag). Undefined or pending steps fail the run.
export default { ...base, tags: 'not @wip', strict: true };

// `pnpm test:features:wip`: run the @wip features to see which steps are still pending. Never fails.
export const wip = { ...base, tags: '@wip', strict: false, format: ['summary'] };
