import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

// Same image as infra/docker-compose.yml, so tests and local dev run the same database:
// PostgreSQL 16 with PostGIS, ltree and pgvector (ENG-04). The first run builds the image; Docker caches it.
const DOCKERFILE_DIR = fileURLToPath(new URL('../../../../infra/postgres', import.meta.url));
const IMAGE = 'kiezruf/postgres:16-postgis-pgvector';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

export default async function setup(project: TestProject) {
  await PostgreSqlContainer.fromDockerfile(DOCKERFILE_DIR).build(IMAGE, { deleteOnExit: false });
  container = await new PostgreSqlContainer(IMAGE).start();
  project.provide('databaseUrl', container.getConnectionUri());
  return async () => {
    await container?.stop();
  };
}
