// Loads demo data (demo.ts) into the database in DATABASE_URL and the photo storage from .env:
//   pnpm --filter api db:seed:demo            add demo data (skipped when it is already there)
//   pnpm --filter api db:seed:demo --reset    remove the demo data, then add it again
//   pnpm --filter api db:seed:demo --remove   remove the demo data only
// Refuses to run with NODE_ENV=production, and asks for --yes against any database that is not on this machine.
import { aiFromConfig, loadConfig } from '../../config.js';
import { s3PhotoStorage } from '../../storage/photos.js';
import { createDb } from '../client.js';
import { DEMO_DOMAIN, DEMO_STAFF, removeDemoData, seedDemo } from './demo.js';

const args = new Set(process.argv.slice(2));
if (process.env.NODE_ENV === 'production') {
  console.error('Demo data is not for production (NODE_ENV=production).');
  process.exit(1);
}
const config = loadConfig();
const host = new URL(config.DATABASE_URL).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host) && !args.has('--yes')) {
  console.error(`The database is on ${host}, not this machine. Add --yes if you mean to put demo data there (staging only).`);
  process.exit(1);
}

const db = createDb(config.DATABASE_URL, { max: 2 });
try {
  if (args.has('--reset') || args.has('--remove')) {
    console.log(`Removed ${await removeDemoData(db)} demo accounts and their data.`);
  }
  if (!args.has('--remove')) {
    const storage = s3PhotoStorage({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      accessKeyId: config.S3_ACCESS_KEY,
      secretAccessKey: config.S3_SECRET_KEY,
      bucket: config.S3_BUCKET_PRIVATE,
      publicBucket: config.S3_BUCKET_PUBLIC,
    });
    const result = await seedDemo({ db, storage, ai: aiFromConfig(config), log: console.log });
    if (!result.skipped) {
      console.log('\nDemo staff (sign in with Supabase; codes arrive in the local mail catcher):');
      for (const s of DEMO_STAFF) console.log(`  ${s.role.padEnd(15)} ${s.path.padEnd(14)} ${s.email}`);
      console.log(`\nDemo citizens are buerger.01 … buerger.60@${DEMO_DOMAIN}.`);
    }
  }
} finally {
  await db.$client.end();
}
