import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

// Set up as in Next.js's bundled guide (node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md).
// Async Server Components are not supported by Vitest; cover those with Playwright instead.
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
