import { defineConfig } from 'drizzle-kit';

// `pnpm --filter api db:generate` writes forward-only SQL migrations to ./drizzle from src/db/schema.ts.
// Migrations are applied with `pnpm --filter api db:migrate` (src/db/migrate.ts), not with drizzle-kit.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  // PostGIS creates its own tables (spatial_ref_sys); leave them alone.
  extensionsFilters: ['postgis'],
});
