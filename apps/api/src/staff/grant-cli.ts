// Grants a staff role from the command line, as the table owner. Used once per environment to create the first
// platform admin, who then invites everyone else from the console (US-46):
//   pnpm --filter api staff:grant anna@example.org de platform_admin
// Like a console invitation (ENG-24), it creates the person's Supabase user with a temporary password, printed once,
// unless the address already belongs to a linked account. Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for that.
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { supabaseAdmin } from '../auth/supabase.js';
import { createDb } from '../db/client.js';
import { staffRoleKind } from '../db/schema.js';

const [email, path, role] = process.argv.slice(2);
const roles = staffRoleKind.enumValues as readonly string[];
if (!email || !path || !role || !roles.includes(role)) {
  console.error(`Usage: staff:grant <email> <tenant-path> <${roles.join('|')}>`);
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = createDb(url, { max: 1 });
try {
  const [linked] = await db.execute<{ id: string }>(sql`SELECT id FROM account WHERE lower(email) = lower(${email}) AND auth_user_id IS NOT NULL`);
  let temporaryPassword: string | null = null;
  if (!linked) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed to create the sign-in');
    temporaryPassword = randomBytes(12).toString('base64url');
    const created = await supabaseAdmin({ url: supabaseUrl, serviceRoleKey }).createInvitedUser(email.toLowerCase(), temporaryPassword);
    if (!created) throw new Error(`${email} already has a Supabase sign-in that is not ours to take over; remove it in Supabase first`);
  }
  await db.transaction(async (tx) => {
    const [tenant] = await tx.execute<{ id: string; name: string }>(sql`SELECT id, name FROM tenant WHERE path = ${path}::ltree`);
    if (!tenant) throw new Error(`No tenant at path ${path}`);
    const [acct] = await tx.execute<{ id: string }>(sql`
      INSERT INTO account (email) VALUES (lower(${email})) ON CONFLICT ((lower(email))) DO UPDATE SET email = account.email RETURNING id`);
    await tx.execute(sql`
      INSERT INTO staff_role (account_id, tenant_id, role) VALUES (${acct!.id}, ${tenant.id}, ${role}::staff_role_kind)
      ON CONFLICT (account_id, tenant_id) DO UPDATE SET role = EXCLUDED.role`);
    await tx.execute(sql`
      INSERT INTO audit_event (kind, tenant_id, to_value, reason, data)
      VALUES ('role_grant', ${tenant.id}, ${role}, 'staff:grant command', jsonb_build_object('account', ${acct!.id}::text))`);
    console.log(`${email} is now ${role} at ${tenant.name} (${path}). Sign in at /console.`);
    if (temporaryPassword) console.log(`Temporary password (shown once): ${temporaryPassword}`);
  });
} finally {
  await db.$client.end();
}
