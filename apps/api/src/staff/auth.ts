// Staff sign-in (ENG-09, US-42): the email code first, then a TOTP code from an authenticator app. The first sign-in
// enrols the authenticator. Staff sessions last 12 hours (engineering plan, Security: "Sessions").
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { account, staffChallenge, staffRole, staffTotp } from '../db/schema.js';
import { withAuthAccess } from '../db/scope.js';
import { consumeLoginCode, createSession, normaliseEmail } from '../auth/service.js';
import { decryptSecret, encryptSecret, newTotpSecret, otpauthUri, verifyTotp } from './totp.js';

export const STAFF_SESSION_HOURS = 12;
const CHALLENGE_MINUTES = 10;
const MAX_TOTP_ATTEMPTS = 5;

export type StaffVerifyResult =
  | { ok: true; challenge: string; next: 'totp' }
  | { ok: true; challenge: string; next: 'enroll'; otpauthUri: string; secret: string }
  | { ok: false; status: 400 | 403; error: 'invalid_code' | 'too_many_attempts' | 'not_staff' };

export async function staffVerifyEmail(db: Db, authSecret: string, rawEmail: string, code: string): Promise<StaffVerifyResult> {
  const email = normaliseEmail(rawEmail);
  return withAuthAccess(db, async (tx) => {
    const checked = await consumeLoginCode(tx, authSecret, email, code);
    if (!checked.ok) return { ok: false, status: 400, error: checked.reason } as const;

    const [staff] = await tx
      .select({ id: account.id })
      .from(account)
      .innerJoin(staffRole, eq(staffRole.accountId, account.id))
      .where(and(sql`lower(${account.email}) = ${email}`, isNull(account.deletedAt), isNull(account.bannedAt)))
      .limit(1);
    if (!staff) return { ok: false, status: 403, error: 'not_staff' } as const;
    await tx.update(account).set({ verifiedAt: sql`COALESCE(verified_at, now())` }).where(eq(account.id, staff.id));

    const [challenge] = await tx
      .insert(staffChallenge)
      .values({ accountId: staff.id, expiresAt: sql`now() + make_interval(mins => ${CHALLENGE_MINUTES})` })
      .returning({ id: staffChallenge.id });

    const [totp] = await tx.select({ confirmedAt: staffTotp.confirmedAt }).from(staffTotp).where(eq(staffTotp.accountId, staff.id));
    if (totp?.confirmedAt) return { ok: true, challenge: challenge!.id, next: 'totp' } as const;

    // Not enrolled yet (or enrolment never finished): a fresh secret each time.
    const secret = newTotpSecret();
    await tx
      .insert(staffTotp)
      .values({ accountId: staff.id, secretEnc: encryptSecret(authSecret, secret) })
      .onConflictDoUpdate({ target: staffTotp.accountId, set: { secretEnc: encryptSecret(authSecret, secret), lastStep: null } });
    return { ok: true, challenge: challenge!.id, next: 'enroll', otpauthUri: otpauthUri(secret, email), secret } as const;
  });
}

export type StaffTotpResult =
  | { ok: true; token: string; expiresAt: Date }
  | { ok: false; error: 'invalid_totp' | 'challenge_expired' };

export async function staffVerifyTotp(db: Db, authSecret: string, challengeId: string, code: string, now = new Date()): Promise<StaffTotpResult> {
  return withAuthAccess(db, async (tx) => {
    const [challenge] = await tx
      .select()
      .from(staffChallenge)
      .where(and(eq(staffChallenge.id, challengeId), isNull(staffChallenge.usedAt), gt(staffChallenge.expiresAt, sql`now()`)))
      .for('update');
    if (!challenge || challenge.attempts >= MAX_TOTP_ATTEMPTS) return { ok: false, error: 'challenge_expired' } as const;

    const [totp] = await tx.select().from(staffTotp).where(eq(staffTotp.accountId, challenge.accountId)).for('update');
    const step = totp ? verifyTotp(decryptSecret(authSecret, totp.secretEnc), code, now, totp.lastStep) : null;
    if (step === null) {
      const attempts = challenge.attempts + 1;
      await tx
        .update(staffChallenge)
        .set({ attempts, ...(attempts >= MAX_TOTP_ATTEMPTS ? { usedAt: sql`now()` } : {}) })
        .where(eq(staffChallenge.id, challenge.id));
      return { ok: false, error: 'invalid_totp' } as const;
    }

    await tx
      .update(staffTotp)
      .set({ lastStep: step, confirmedAt: sql`COALESCE(confirmed_at, now())` })
      .where(eq(staffTotp.accountId, challenge.accountId));
    await tx.update(staffChallenge).set({ usedAt: sql`now()` }).where(eq(staffChallenge.id, challenge.id));
    const created = await createSession(tx, challenge.accountId, 'staff', STAFF_SESSION_HOURS);
    return { ok: true, ...created } as const;
  });
}

/** The caller's grants with tenant names, for GET /staff/me and the console's permission checks. */
export async function staffGrants(db: Db, accountId: string) {
  return withAuthAccess(db, async (tx) => {
    const [me] = await tx.select({ id: account.id, email: account.email }).from(account).where(eq(account.id, accountId));
    const grants = await tx.execute<{ tenantId: string; tenantName: string; path: string; role: string }>(sql`
      SELECT t.id AS "tenantId", t.name AS "tenantName", t.path::text AS path, s.role
      FROM staff_role s JOIN tenant t ON t.id = s.tenant_id
      WHERE s.account_id = ${accountId} ORDER BY t.path`);
    return { ...me!, grants: [...grants] };
  });
}
