// PostgreSQL for integration and Gherkin tests: the infra/postgres image (PostGIS, ltree, pgvector), started with
// Testcontainers. Needs Docker. The first run builds the image; Docker caches it.
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import { createDb, type Db } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { seedTenants } from '../../src/db/seed/tenants.js';

const DOCKERFILE_DIR = fileURLToPath(new URL('../../../../infra/postgres', import.meta.url));
export const DATABASE_IMAGE = 'kiezruf/postgres:16-postgis-pgvector';

export async function startDatabase(): Promise<{ url: string; stop: () => Promise<void> }> {
  await PostgreSqlContainer.fromDockerfile(DOCKERFILE_DIR).build(DATABASE_IMAGE, { deleteOnExit: false });
  const container = await new PostgreSqlContainer(DATABASE_IMAGE).start();
  return { url: container.getConnectionUri(), stop: async () => void (await container.stop()) };
}

/** Creates an empty database `name` on the server at `serverUrl`, migrates it and optionally seeds the tenant tree. */
export async function createMigratedDatabase(
  serverUrl: string,
  name: string,
  options: { seed?: boolean; beforeMigrate?: (url: string) => Promise<void> } = {},
): Promise<Db> {
  const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  await options.beforeMigrate?.(url.toString());
  await runMigrations(url.toString());
  const db = createDb(url.toString(), { max: 4 });
  if (options.seed) await seedTenants(db);
  return db;
}
