import { inject } from 'vitest';
import type { Db } from '../../src/db/client.js';
import { createMigratedDatabase as create } from '../support/database.js';

/** Creates an empty, migrated database in the test container and returns a connection as its owner. */
export function createMigratedDatabase(name: string, options: { seed?: boolean } = {}): Promise<Db> {
  return create(inject('databaseUrl'), name, options);
}
