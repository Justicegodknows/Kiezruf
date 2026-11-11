import { defineConfig } from 'vitest/config';

// Integration tests against a real PostgreSQL 16 (PostGIS, ltree, pgvector) started by Testcontainers (needs Docker).
// Most API code is reached only through these tests, so API coverage is measured here, together with the unit tests
// (`pnpm --filter api test:int:coverage`).
export default defineConfig({
  test: {
    include: ['test/integration/**/*.int.test.ts', ...(process.argv.includes('--coverage') ? ['src/**/*.test.ts'] : [])],
    globalSetup: ['test/integration/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 300_000,
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/server.ts', 'src/worker.ts', 'src/staff/grant-cli.ts', 'src/db/seed/run.ts', 'src/db/migrate.ts'],
      reportsDirectory: 'coverage/integration',
    },
  },
});
