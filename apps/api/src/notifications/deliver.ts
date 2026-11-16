// Delivers the notification outbox (US-20, US-29, US-44). Database triggers fill the outbox in the same transaction
// as the change (a report's status, a tenant going live); the worker calls this every minute.
//
// Channels: push when it is on and the account has a device token; otherwise email when it is on. "Push on mobile,
// email on web" (US-29) follows from that: web-only accounts have no push token.
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { Mailer } from '../mail/mailer.js';
import { goLiveMail, goLivePush, statusChangeMail, statusChangePush, type Locale } from '../mail/messages.js';
import type { PushSender } from './push.js';

export const MAX_DELIVERY_ATTEMPTS = 5;

export interface DeliveryDeps {
  db: Db;
  mailer: Mailer;
  push: PushSender;
  /** Base URL of the citizen web, for links in emails. */
  webBaseUrl: string;
}

type Pending = {
  id: string;
  kind: 'status_change' | 'go_live';
  status: string | null;
  attempts: number;
  email: string | null;
  locale: string;
  push_on: boolean;
  email_on: boolean;
  public_id: string | null;
  tenant_name: string | null;
  tokens: string[];
};

export async function deliverPendingNotifications(deps: DeliveryDeps, limit = 100): Promise<{ sent: number; failed: number }> {
  return deps.db.transaction(async (tx) => {
    const rows = await tx.execute<Pending>(sql`
      SELECT n.id, n.kind, n.payload->>'status' AS status, n.attempts, a.email, a.locale,
             CASE n.kind WHEN 'status_change' THEN COALESCE(s.status_change_push, true) ELSE COALESCE(s.go_live_push, true) END AS push_on,
             CASE n.kind WHEN 'status_change' THEN COALESCE(s.status_change_email, true) ELSE COALESCE(s.go_live_email, true) END AS email_on,
             r.public_id, t.name AS tenant_name,
             ARRAY(SELECT pt.token FROM push_token pt WHERE pt.account_id = n.account_id ORDER BY pt.token) AS tokens
      FROM notification n
      JOIN account a ON a.id = n.account_id
      LEFT JOIN notification_setting s ON s.account_id = n.account_id
      LEFT JOIN report r ON r.id = n.report_id
      LEFT JOIN tenant t ON t.id = n.tenant_id
      WHERE n.sent_at IS NULL AND n.attempts < ${MAX_DELIVERY_ATTEMPTS} AND a.deleted_at IS NULL
      ORDER BY n.created_at
      LIMIT ${limit}
      FOR UPDATE OF n SKIP LOCKED`);

    let sent = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await deliverOne(deps, tx, row);
        await tx.execute(sql`UPDATE notification SET sent_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = ${row.id}`);
        sent++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await tx.execute(sql`UPDATE notification SET attempts = attempts + 1, last_error = ${message.slice(0, 500)} WHERE id = ${row.id}`);
        failed++;
      }
    }
    return { sent, failed };
  });
}

async function deliverOne(deps: DeliveryDeps, tx: Parameters<Parameters<Db['transaction']>[0]>[0], row: Pending) {
  const locale: Locale = row.locale === 'en' ? 'en' : 'de';
  let pushed = false;

  if (row.push_on && row.tokens.length > 0) {
    const text = row.kind === 'status_change' ? statusChangePush(locale) : goLivePush(locale);
    const data: Record<string, string> = row.public_id ? { publicId: row.public_id } : {};
    const results = await deps.push.send(row.tokens.map((to) => ({ to, ...text, data })));
    const gone = row.tokens.filter((_, i) => results[i] && !results[i]!.ok && (results[i] as { unregistered: boolean }).unregistered);
    for (const token of gone) await tx.execute(sql`DELETE FROM push_token WHERE token = ${token}`);
    pushed = results.some((r) => r.ok);
    const retryable = results.find((r) => !r.ok && !r.unregistered);
    if (!pushed && retryable && !retryable.ok) throw new Error(retryable.error);
  }

  // Email when push is off, there is no device, or every device token turned out to be stale.
  if (!pushed && row.email_on && row.email) {
    if (row.kind === 'status_change' && row.public_id && row.status) {
      const url = `${deps.webBaseUrl}/reports/${row.public_id}`;
      await deps.mailer.send({ to: row.email, ...statusChangeMail(locale, row.public_id, row.status, url) });
    } else if (row.kind === 'go_live' && row.tenant_name) {
      await deps.mailer.send({ to: row.email, ...goLiveMail(locale, row.tenant_name, deps.webBaseUrl) });
    }
  }
}
