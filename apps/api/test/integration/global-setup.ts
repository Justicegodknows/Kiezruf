import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

// Same image as infra/docker-compose.yml, so tests and local dev run the same database.
const IMAGE = 'postgis/postgis:16-3.4';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

export default async function setup(project: TestProject) {
  container = await new PostgreSqlContainer(IMAGE).start();
  project.provide('databaseUrl', container.getConnectionUri());
  return async () => {
    await container?.stop();
  };
}
