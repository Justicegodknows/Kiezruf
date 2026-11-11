// Sign-in with an email one-time code (US-01, US-37), then an opaque session token.
// Engineering plan, Security: 6 digits, valid 10 minutes, 5 tries; citizen sessions last 30 days.
// Phone codes wait for E-02; passkeys and the staff second factor come later (PROGRESS.md).
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { account, loginCode, session } from '../db/schema.js';
import { withAuthAccess } from '../db/scope.js';
import type { Locale } from '../mail/messages.js';

export const CODE_VALID_MINUTES = 10;
export const MAX_CODE_ATTEMPTS = 5;
/** New codes per email address per hour. Stops mail bombing one address and slows guessing. */
export const MAX_CODES_PER_HOUR = 5;
export const CITIZEN_SESSION_DAYS = 30;

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashCode(secret: string, email: string, code: string): string {
  return createHmac('sha256', secret).update(`${email}:${code}`).digest('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type RequestCodeResult = { ok: true; code: string } | { ok: false; reason: 'too_many_codes' };

/** Creates a new code for `email` and retires older unused ones. The caller mails the code. */
export async function requestCode(db: Db, secret: string, rawEmail: string): Promise<RequestCodeResult> {
  const email = normaliseEmail(rawEmail);
  return withAuthAccess(db, async (tx) => {
    const [recent] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(loginCode)
      .where(and(eq(loginCode.email, email), gt(loginCode.createdAt, sql`now() - interval '1 hour'`)));
    if ((recent?.n ?? 0) >= MAX_CODES_PER_HOUR) return { ok: false, reason: 'too_many_codes' } as const;

    await tx
      .update(loginCode)
      .set({ consumedAt: sql`now()` })
      .where(and(eq(loginCode.email, email), isNull(loginCode.consumedAt)));
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await tx.insert(loginCode).values({
      email,
      codeHash: hashCode(secret, email, code),
      expiresAt: sql`now() + make_interval(mins => ${CODE_VALID_MINUTES})`,
    });
    return { ok: true, code } as const;
  });
}

export type VerifyCodeResult =
  | { ok: true; token: string; expiresAt: Date; accountId: string; isNewAccount: boolean }
  | { ok: false; reason: 'invalid_code' | 'too_many_attempts' | 'account_banned' };

type AuthTx = Parameters<Parameters<typeof withAuthAccess>[1]>[0];

/** Checks and uses up the latest code for `email`. Shared by citizen and staff sign-in. Run inside withAuthAccess. */
export async function consumeLoginCode(
  tx: AuthTx,
  secret: string,
  email: string,
  code: string,
): Promise<{ ok: true } | { ok: false; reason: 'invalid_code' | 'too_many_attempts' }> {
  const [row] = await tx
    .select({ id: loginCode.id, codeHash: loginCode.codeHash, attempts: loginCode.attempts })
    .from(loginCode)
    .where(and(eq(loginCode.email, email), isNull(loginCode.consumedAt), gt(loginCode.expiresAt, sql`now()`)))
    .orderBy(desc(loginCode.createdAt))
    .limit(1)
    .for('update');
  if (!row) return { ok: false, reason: 'invalid_code' };

  const attempts = row.attempts + 1;
  const expected = Buffer.from(row.codeHash, 'hex');
  const given = Buffer.from(hashCode(secret, email, code), 'hex');
  const matches = expected.length === given.length && timingSafeEqual(expected, given);
  if (!matches) {
    const locked = attempts >= MAX_CODE_ATTEMPTS;
    await tx
      .update(loginCode)
      .set({ attempts, ...(locked ? { consumedAt: sql`now()` } : {}) })
      .where(eq(loginCode.id, row.id));
    return { ok: false, reason: locked ? 'too_many_attempts' : 'invalid_code' };
  }
  await tx.update(loginCode).set({ attempts, consumedAt: sql`now()` }).where(eq(loginCode.id, row.id));
  return { ok: true };
}

/** A new session token for `accountId`. The token is shown once; only its hash is stored. */
export async function createSession(tx: AuthTx, accountId: string, kind: 'citizen' | 'staff', hours: number) {
  const token = randomBytes(32).toString('base64url');
  const [created] = await tx
    .insert(session)
    .values({ tokenHash: hashToken(token), accountId, kind, expiresAt: sql`now() + make_interval(hours => ${hours})` })
    .returning({ expiresAt: session.expiresAt });
  return { token, expiresAt: created!.expiresAt };
}

/**
 * Checks a code. On success it creates the account on first sign-in (no address, no residency check: D-03)
 * and returns a new session token. The token is shown once; only its hash is stored.
 */
export async function verifyCode(db: Db, secret: string, rawEmail: string, code: string, locale: Locale): Promise<VerifyCodeResult> {
  const email = normaliseEmail(rawEmail);
  return withAuthAccess(db, async (tx) => {
    const checked = await consumeLoginCode(tx, secret, email, code);
    if (!checked.ok) return checked;

    const [acct] = await tx.execute<{ id: string; inserted: boolean; banned: boolean }>(sql`
      INSERT INTO account (email, verified_at, locale) VALUES (${email}, now(), ${locale})
      ON CONFLICT ((lower(email))) DO UPDATE SET verified_at = COALESCE(account.verified_at, EXCLUDED.verified_at)
      RETURNING id, (xmax = 0) AS inserted, banned_at IS NOT NULL AS banned`);
    if (acct!.banned) return { ok: false, reason: 'account_banned' } as const;

    const created = await createSession(tx, acct!.id, 'citizen', CITIZEN_SESSION_DAYS * 24);
    return { ok: true, ...created, accountId: acct!.id, isNewAccount: acct!.inserted } as const;
  });
}

export interface SessionAccount {
  accountId: string;
  kind: 'citizen' | 'staff';
}

/** The account behind a session token, or null if the token is unknown, expired or its account deleted. */
export async function resolveSession(db: Db, token: string): Promise<SessionAccount | null> {
  return withAuthAccess(db, async (tx) => {
    const [row] = await tx
      .select({ accountId: session.accountId, kind: session.kind })
      .from(session)
      .innerJoin(account, eq(account.id, session.accountId))
      .where(
        and(eq(session.tokenHash, hashToken(token)), gt(session.expiresAt, sql`now()`), isNull(account.deletedAt), isNull(account.bannedAt)),
      );
    return row ?? null;
  });
}

export async function endSession(db: Db, token: string): Promise<void> {
  await withAuthAccess(db, (tx) => tx.delete(session).where(eq(session.tokenHash, hashToken(token))));
}
