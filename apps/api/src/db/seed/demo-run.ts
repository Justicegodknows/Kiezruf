// Loads demo data (demo.ts) into the database in DATABASE_URL and the photo storage from .env:
//   pnpm --filter api db:seed:demo            add demo data (skipped when it is already there)
//   pnpm --filter api db:seed:demo --reset    remove the demo data, then add it again
//   pnpm --filter api db:seed:demo --remove   remove the demo data only
//   ... --sign-ins                            also give the demo staff and one demo citizen a Supabase sign-in and
//                                             print their passwords once (needs SUPABASE_URL and
//                                             SUPABASE_SERVICE_ROLE_KEY). --reset and --remove delete old demo sign-ins.
// Refuses to run with NODE_ENV=production, and asks for --yes against any database that is not on this machine.
import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from '../../auth/supabase.js';
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

/** The demo accounts that get a sign-in: every demo staff role, and one citizen with reports of their own. */
const SIGN_INS = [...DEMO_STAFF.map((s) => ({ email: s.email, role: `${s.role} ${s.path}` })), { email: `buerger.01@${DEMO_DOMAIN}`, role: 'citizen' }];

const supabase = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('--sign-ins needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  return { url: url.replace(/\/$/, ''), key };
};

/** Deletes every Supabase user on the demo domain, so a reset starts with fresh sign-ins. */
async function removeDemoSignIns(): Promise<number> {
  const { url, key } = supabase();
  const headers = { apikey: key, authorization: `Bearer ${key}` };
  let removed = 0;
  for (let page = 1; page < 50; page++) {
    const response = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, { headers });
    if (!response.ok) throw new Error(`Supabase admin answered ${response.status}`);
    const { users } = (await response.json()) as { users: { id: string; email?: string }[] };
    for (const u of users.filter((x) => x.email?.endsWith(`@${DEMO_DOMAIN}`))) {
      const del = await fetch(`${url}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers });
      if (del.ok || del.status === 404) removed++;
    }
    if (users.length < 200) break;
  }
  return removed;
}

async function createDemoSignIns(): Promise<void> {
  const { url, key } = supabase();
  const admin = supabaseAdmin({ url, serviceRoleKey: key });
  console.log('\nDemo sign-ins (shown once; staff add an authenticator app on their first console sign-in):');
  for (const s of SIGN_INS) {
    const password = `Demo-${randomBytes(9).toString('base64url')}`;
    const created = await admin.createInvitedUser(s.email, password);
    console.log(created ? `  SIGNIN ${s.email} ${password} ${s.role}` : `  ${s.email}: already has a sign-in, unchanged (use --reset)`);
  }
}

const db = createDb(config.DATABASE_URL, { max: 2 });
try {
  if (args.has('--reset') || args.has('--remove')) {
    if (args.has('--sign-ins')) console.log(`Removed ${await removeDemoSignIns()} demo sign-ins.`);
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
      publicObjectAcl: config.S3_PUBLIC_OBJECT_ACL,
    });
    const result = await seedDemo({ db, storage, ai: aiFromConfig(config), log: console.log });
    if (!result.skipped) {
      console.log('\nDemo staff:');
      for (const s of DEMO_STAFF) console.log(`  ${s.role.padEnd(15)} ${s.path.padEnd(14)} ${s.email}`);
      console.log(`\nDemo citizens are buerger.01 … buerger.60@${DEMO_DOMAIN}.`);
    }
    if (args.has('--sign-ins')) await createDemoSignIns();
  }
} finally {
  await db.$client.end();
}
