// Linking Supabase Auth users to accounts (ENG-22, ENG-24, US-01, US-37). Sign-in itself (passwords, sessions, MFA) is
// Supabase's; the API only sees verified access tokens and keeps its own account rows, which everything else
// (reports, votes, roles, row-level security) refers to.
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { withAuthAccess } from '../db/scope.js';
import type { SupabaseClaims } from './supabase.js';

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type AccountResult =
  | { ok: true; accountId: string; isNewAccount: boolean }
  | { ok: false; reason: 'account_banned' | 'account_deleted' | 'no_contact' | 'email_taken' };

/**
 * The account for a Supabase user: by its user id; else, for a user this API created for a staff invitation, the
 * account with that email and no Supabase user yet (ENG-18, ENG-24); else a new account. Sign-up needs no email
 * proof (ENG-24), so a self-registered user never takes over an existing account: if its address is already taken
 * by an unlinked account, it gets none.
 */
export async function resolveAccount(db: Db, claims: SupabaseClaims): Promise<AccountResult> {
  return withAuthAccess(db, async (tx) => {
    const [linked] = await tx.execute<{ id: string; banned: boolean; deleted: boolean }>(sql`
      SELECT id, banned_at IS NOT NULL AS banned, deleted_at IS NOT NULL AS deleted FROM account WHERE auth_user_id = ${claims.sub}`);
    if (linked?.deleted) return { ok: false, reason: 'account_deleted' };
    if (linked) return linked.banned ? { ok: false, reason: 'account_banned' } : { ok: true, accountId: linked.id, isNewAccount: false };
    // Phone sign-in is not offered (E-02): every account has an email address.
    if (!claims.email) return { ok: false, reason: 'no_contact' };

    if (claims.invited) {
      const [invited] = await tx.execute<{ id: string; banned: boolean }>(sql`
        UPDATE account SET auth_user_id = ${claims.sub}, verified_at = COALESCE(verified_at, now())
        WHERE lower(email) = ${claims.email} AND auth_user_id IS NULL AND deleted_at IS NULL
        RETURNING id, banned_at IS NOT NULL AS banned`);
      if (invited) return invited.banned ? { ok: false, reason: 'account_banned' } : { ok: true, accountId: invited.id, isNewAccount: false };
    }
    const [created] = await tx.execute<{ id: string }>(sql`
      INSERT INTO account (auth_user_id, email, verified_at) VALUES (${claims.sub}, ${claims.email}, now())
      ON CONFLICT ((lower(email))) DO NOTHING RETURNING id`);
    if (!created) return { ok: false, reason: 'email_taken' };
    return { ok: true, accountId: created.id, isNewAccount: true };
  });
}
