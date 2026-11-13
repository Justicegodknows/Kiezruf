import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export function createDb(databaseUrl: string, options: { max?: number } = {}) {
  const client = postgres(databaseUrl, { max: options.max ?? 10, onnotice: () => {} });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
/** A transaction handle, as passed to the callback of `db.transaction`. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
