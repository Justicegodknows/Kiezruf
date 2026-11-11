import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      // Definition of Done: coverage in packages/shared must not drop. Raise these as the package grows.
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
    },
  },
});
