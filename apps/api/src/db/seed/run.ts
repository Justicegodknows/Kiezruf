// Loads seed data into the database in DATABASE_URL: pnpm --filter api db:seed
import { createDb } from '../client.js';
import { seedTenants } from './tenants.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = createDb(url, { max: 1 });
try {
  const { tenants } = await seedTenants(db);
  console.log(`Seeded ${tenants} tenants.`);
} finally {
  await db.$client.end();
}
