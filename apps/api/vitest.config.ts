import { defineConfig } from 'vitest/config';

// Unit tests: fast, no Docker. Integration tests live in test/integration and use vitest.int.config.ts.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/server.ts'],
    },
  },
});
