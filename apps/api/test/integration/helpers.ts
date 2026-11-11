import postgres from 'postgres';
import { inject } from 'vitest';
import { createDb, type Db } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';

/** Creates an empty database in the test container, applies all migrations and returns a connection as its owner. */
export async function createMigratedDatabase(name: string): Promise<Db> {
  const admin = postgres(inject('databaseUrl'), { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
  const url = new URL(inject('databaseUrl'));
  url.pathname = `/${name}`;
  await runMigrations(url.toString());
  return createDb(url.toString(), { max: 4 });
}
