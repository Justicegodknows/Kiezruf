import { defineConfig } from 'vitest/config';

// Integration tests against a real PostgreSQL 16 + PostGIS started by Testcontainers (needs Docker).
export default defineConfig({
  test: {
    include: ['test/integration/**/*.int.test.ts'],
    globalSetup: ['test/integration/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
