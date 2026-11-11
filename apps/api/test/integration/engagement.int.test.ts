// Comments (US-19), follow (US-20), notifications (US-29), go-live alerts (US-44) and account changes (US-34, US-35),
// against the real migrations and tenant seed.
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../src/db/client.js';
import { account, comment, notification, pushToken, report, session, staffRole, tenant } from '../../src/db/schema.js';
import { loadStaffScope, withStaffScope } from '../../src/db/scope.js';
import { deliverPendingNotifications, MAX_DELIVERY_ATTEMPTS } from '../../src/notifications/deliver.js';
import { buildTestApp, signIn, uploadPhotos, type TestApp } from '../support/app.js';
import { FakeMailer, FakePushSender } from '../support/fakes.js';
import { createMigratedDatabase } from './helpers.js';

const KARL_MARX_STR_100 = { lat: 52.4795, lon: 13.4365 }; // Neukölln
const RATHAUS_SPANDAU = { lat: 52.5352, lon: 13.2 }; // Spandau
const KOTTBUSSER_TOR = { lat: 52.499, lon: 13.418 }; // Friedrichshain-Kreuzberg, not live
const MARIENPLATZ_MUNICH = { lat: 48.1374, lon: 11.5755 };

let db: Db;
let t: TestApp;
let n = 0;
const newEmail = () => `engaged${++n}@example.org`;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

beforeAll(async () => {
  db = await createMigratedDatabase('engagement', { seed: true });
  t = await buildTestApp(db);
});
afterAll(async () => {
  await t?.app.close();
  await db?.$client.end();
});

async function postPublicReport(token: string, at = KARL_MARX_STR_100): Promise<string> {
  const res = await t.app.inject({
    method: 'POST',
    url: '/reports',
    headers: auth(token),
    payload: {
      category: 'pothole',
      capture: { ...at, accuracyM: 10, capturedAt: new Date().toISOString() },
      photoKeys: await uploadPhotos(t, token),
    },
  });
  if (res.statusCode !== 201) throw new Error(res.body);
  const publicId = res.json().publicId as string;
  await db.update(report).set({ status: 'open' }).where(eq(report.publicId, publicId));
  return publicId;
}

const accountIdFor = async (email: string) =>
  (await db.select({ id: account.id }).from(account).where(eq(account.email, email)))[0]!.id;

const setStatus = (publicId: string, status: 'acknowledged' | 'in_progress' | 'resolved' | 'open') =>
  db.update(report).set({ status }).where(eq(report.publicId, publicId));

describe('comments (US-19)', () => {
  let token: string;
  let publicId: string;
  beforeAll(async () => {
    token = await signIn(t, newEmail());
    publicId = await postPublicReport(token);
  });

  const add = (body: string, who = token, id = publicId) =>
    t.app.inject({ method: 'POST', url: `/reports/${id}/comments`, headers: auth(who), payload: { body } });
  const list = (id = publicId) => t.app.inject({ method: 'GET', url: `/public/reports/${id}/comments` });

  it('adds a comment that anyone can read, without its author', async () => {
    const res = await add('Same on the other side of the street.');
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: expect.any(String), held: false });
    const comments = (await list()).json().comments;
    expect(comments).toEqual([{ id: res.json().id, body: 'Same on the other side of the street.', createdAt: expect.any(String) }]);
  });

  it('allows 500 characters and refuses 501', async () => {
    expect((await add('a'.repeat(500))).statusCode).toBe(201);
    expect((await add('a'.repeat(501))).json()).toEqual({ error: 'invalid_request', fields: ['body'] });
    expect((await add('   ')).statusCode).toBe(400);
  });

  it('holds an offensive comment for review instead of publishing it', async () => {
    const res = await add('Der Typ vom Amt ist ein Arschloch');
    expect(res.json()).toEqual({ id: expect.any(String), held: true });
    const ids = (await list()).json().comments.map((c: { id: string }) => c.id);
    expect(ids).not.toContain(res.json().id);
    const [row] = await db.select({ state: comment.state }).from(comment).where(eq(comment.id, res.json().id));
    expect(row!.state).toBe('held');
  });

  it('cannot comment on a report that is not public, or without a session', async () => {
    await db.update(report).set({ status: 'processing' }).where(eq(report.publicId, publicId));
    expect((await add('Hello')).statusCode).toBe(404);
    expect((await list()).statusCode).toBe(404);
    await setStatus(publicId, 'open');
    const anonymous = await t.app.inject({ method: 'POST', url: `/reports/${publicId}/comments`, payload: { body: 'Hi' } });
    expect(anonymous.statusCode).toBe(401);
  });

  it('flags a visible comment once per account, and not a held one', async () => {
    const visible = (await add('Visible comment')).json().id;
    const held = (await add('fuck this')).json().id;
    const other = await signIn(t, newEmail());
    const flag = (id: string) => t.app.inject({ method: 'POST', url: `/comments/${id}/flag`, headers: auth(other), payload: { reason: 'spam' } });
    expect((await flag(visible)).statusCode).toBe(204);
    expect((await flag(visible)).statusCode).toBe(204);
    expect((await flag(held)).statusCode).toBe(404);
    const [count] = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM comment_flag WHERE comment_id = ${visible}`);
    expect(count!.n).toBe(1);
  });

  it('comment rows follow the scope of their report (US-42)', async () => {
    const spReport = await postPublicReport(token, RATHAUS_SPANDAU);
    await add('Comment in Spandau', token, spReport);
    const [worker] = await db.insert(account).values({ email: newEmail() }).returning({ id: account.id });
    const [nk] = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.path, 'de.be.bec.nk'));
    await db.insert(staffRole).values({ accountId: worker!.id, tenantId: nk!.id, role: 'case_worker' });
    const scope = await loadStaffScope(db, worker!.id);
    const bodies = (await withStaffScope(db, scope, (tx) => tx.select({ body: comment.body }).from(comment))).map((c) => c.body);
    expect(bodies).toContain('Same on the other side of the street.');
    expect(bodies).not.toContain('Comment in Spandau');
  });
});

describe('follow (US-20)', () => {
  it('follows automatically on posting and on Me too, and can be undone', async () => {
    const reporter = await signIn(t, newEmail());
    const voter = await signIn(t, newEmail());
    const publicId = await postPublicReport(reporter);
    const me = (token: string) => t.app.inject({ method: 'GET', url: `/reports/${publicId}/me`, headers: auth(token) });

    expect((await me(reporter)).json()).toEqual({ following: true, meToo: false, mine: true });
    expect((await me(voter)).json()).toEqual({ following: false, meToo: false, mine: false });

    await t.app.inject({ method: 'PUT', url: `/reports/${publicId}/me-too`, headers: auth(voter), payload: { ...KARL_MARX_STR_100, accuracyM: 10 } });
    expect((await me(voter)).json()).toEqual({ following: true, meToo: true, mine: false });

    const off = await t.app.inject({ method: 'DELETE', url: `/reports/${publicId}/follow`, headers: auth(voter) });
    expect(off.json()).toEqual({ following: false });
    expect((await me(voter)).json()).toMatchObject({ following: false, meToo: true });

    const on = await t.app.inject({ method: 'PUT', url: `/reports/${publicId}/follow`, headers: auth(voter) });
    expect(on.json()).toEqual({ following: true });
    const follows = await t.app.inject({ method: 'GET', url: '/me/follows', headers: auth(voter) });
    expect(follows.json().reports).toEqual([expect.objectContaining({ publicId, status: 'open', tenantName: 'Neukölln' })]);
  });

  it('lets the reporter follow their own report while it is still being processed, and nobody else', async () => {
    const reporter = await signIn(t, newEmail());
    const res = await t.app.inject({
      method: 'POST',
      url: '/reports',
      headers: auth(reporter),
      payload: { category: 'pothole', capture: { ...KARL_MARX_STR_100, accuracyM: 10, capturedAt: new Date().toISOString() }, photoKeys: await uploadPhotos(t, reporter) },
    });
    const publicId = res.json().publicId;
    const follows = await t.app.inject({ method: 'GET', url: '/me/follows', headers: auth(reporter) });
    expect(follows.json().reports).toEqual([expect.objectContaining({ publicId, status: 'processing' })]);

    const stranger = await signIn(t, newEmail());
    expect((await t.app.inject({ method: 'PUT', url: `/reports/${publicId}/follow`, headers: auth(stranger) })).statusCode).toBe(404);
    expect((await t.app.inject({ method: 'GET', url: `/reports/${publicId}/me`, headers: auth(stranger) })).statusCode).toBe(404);
  });
});

describe('notifications (US-20, US-29)', () => {
  let push: FakePushSender;
  let mailer: FakeMailer;
  const deliver = () => deliverPendingNotifications({ db, mailer, push, webBaseUrl: 'https://kiezruf.test' });

  beforeEach(async () => {
    push = new FakePushSender();
    mailer = new FakeMailer();
    await deliver(); // drain anything earlier tests left in the outbox
    push = new FakePushSender();
    mailer = new FakeMailer();
  });

  const registerToken = (token: string, device: string) =>
    t.app.inject({ method: 'PUT', url: '/me/push-token', headers: auth(token), payload: { token: device, platform: 'ios' } });

  it('pushes a status change to followers with a device, generic text and the report ID only', async () => {
    const reporter = await signIn(t, newEmail());
    expect((await registerToken(reporter, 'ExponentPushToken[aaaaaaaaaaaaaaaa]')).statusCode).toBe(204);
    const publicId = await postPublicReport(reporter);
    await setStatus(publicId, 'acknowledged');

    expect(await deliver()).toEqual({ sent: 1, failed: 0 });
    expect(push.sent).toEqual([
      { to: 'ExponentPushToken[aaaaaaaaaaaaaaaa]', title: 'Kiezruf', body: 'Es gibt Neuigkeiten zu einer Meldung, der Sie folgen.', data: { publicId } },
    ]);
    expect(mailer.sent).toEqual([]);
  });

  it('emails followers without a device, in their language', async () => {
    const email = newEmail();
    const follower = await signIn(t, email);
    await t.app.inject({ method: 'PATCH', url: '/me', headers: auth(follower), payload: { locale: 'en' } });
    const publicId = await postPublicReport(follower);
    await setStatus(publicId, 'in_progress');

    await deliver();
    expect(mailer.sent).toEqual([
      {
        to: email,
        subject: `${publicId}: In progress`,
        text: expect.stringContaining(`https://kiezruf.test/reports/${publicId}`),
      },
    ]);
  });

  it('does not notify when the system publishes a report, or for non-followers', async () => {
    const reporter = await signIn(t, newEmail());
    await postPublicReport(reporter); // processing → open
    expect(await deliver()).toEqual({ sent: 0, failed: 0 });
  });

  it('respects the per-type switches', async () => {
    const follower = await signIn(t, newEmail());
    const res = await t.app.inject({
      method: 'PUT',
      url: '/me/notification-settings',
      headers: auth(follower),
      payload: { statusChange: { push: false, email: false } },
    });
    expect(res.json()).toEqual({ statusChange: { push: false, email: false }, goLive: { push: true, email: true } });
    const get = await t.app.inject({ method: 'GET', url: '/me/notification-settings', headers: auth(follower) });
    expect(get.json()).toEqual(res.json());

    const publicId = await postPublicReport(follower);
    await setStatus(publicId, 'resolved');
    expect(await deliver()).toEqual({ sent: 1, failed: 0 });
    expect(push.sent).toEqual([]);
    expect(mailer.sent).toEqual([]);
  });

  it('drops a stale device token and falls back to email', async () => {
    const email = newEmail();
    const follower = await signIn(t, email);
    await registerToken(follower, 'ExponentPushToken[stalestalestale00]');
    push.unregistered.add('ExponentPushToken[stalestalestale00]');
    const publicId = await postPublicReport(follower);
    await setStatus(publicId, 'acknowledged');

    await deliver();
    expect(mailer.sent.map((m) => m.to)).toEqual([email]);
    expect(await db.select().from(pushToken).where(eq(pushToken.token, 'ExponentPushToken[stalestalestale00]'))).toEqual([]);
  });

  it(`retries a failed push up to ${MAX_DELIVERY_ATTEMPTS} times`, async () => {
    const follower = await signIn(t, newEmail());
    await registerToken(follower, 'ExponentPushToken[retryretryretry0]');
    const publicId = await postPublicReport(follower);
    await setStatus(publicId, 'acknowledged');

    push.failNext = true;
    expect(await deliver()).toEqual({ sent: 0, failed: 1 });
    expect(await deliver()).toEqual({ sent: 1, failed: 0 });
    const [row] = await db.select({ attempts: notification.attempts, sentAt: notification.sentAt }).from(notification)
      .innerJoin(report, eq(report.id, notification.reportId)).where(eq(report.publicId, publicId));
    expect(row).toEqual({ attempts: 2, sentAt: expect.any(Date) });
  });

  it('moves a device token to whoever signed in last on that device', async () => {
    const anna = await signIn(t, newEmail());
    const ben = await signIn(t, newEmail());
    await registerToken(anna, 'ExponentPushToken[shareddevice0000]');
    await registerToken(ben, 'ExponentPushToken[shareddevice0000]');
    const rows = await db.select({ accountId: pushToken.accountId }).from(pushToken).where(eq(pushToken.token, 'ExponentPushToken[shareddevice0000]'));
    expect(rows).toHaveLength(1);
    await t.app.inject({ method: 'DELETE', url: '/me/push-token', headers: auth(ben), payload: { token: 'ExponentPushToken[shareddevice0000]' } });
    expect(await db.select().from(pushToken).where(eq(pushToken.token, 'ExponentPushToken[shareddevice0000]'))).toEqual([]);
  });

  it('refuses a malformed push token', async () => {
    const someone = await signIn(t, newEmail());
    expect((await registerToken(someone, 'not-a-token')).statusCode).toBe(400);
  });
});

describe('go-live alerts (US-44)', () => {
  it('tells subscribers once when their area starts taking reports', async () => {
    const email = newEmail();
    const token = await signIn(t, email);
    const res = await t.app.inject({ method: 'POST', url: '/go-live-alerts', headers: auth(token), payload: KOTTBUSSER_TOR });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ tenant: 'Friedrichshain-Kreuzberg' });
    // Asking twice keeps one alert.
    await t.app.inject({ method: 'POST', url: '/go-live-alerts', headers: auth(token), payload: KOTTBUSSER_TOR });

    const mailer = new FakeMailer();
    const push = new FakePushSender();
    await deliverPendingNotifications({ db, mailer, push, webBaseUrl: 'https://kiezruf.test' });
    mailer.sent.length = 0;

    await db.update(tenant).set({ status: 'pilot' }).where(eq(tenant.path, 'de.be.bec.fk'));
    await deliverPendingNotifications({ db, mailer, push, webBaseUrl: 'https://kiezruf.test' });
    expect(mailer.sent).toEqual([{ to: email, subject: 'Kiezruf ist in Friedrichshain-Kreuzberg gestartet', text: expect.any(String) }]);

    // Going back and forth does not notify again.
    await db.update(tenant).set({ status: 'not_live' }).where(eq(tenant.path, 'de.be.bec.fk'));
    await db.update(tenant).set({ status: 'pilot' }).where(eq(tenant.path, 'de.be.bec.fk'));
    mailer.sent.length = 0;
    await deliverPendingNotifications({ db, mailer, push, webBaseUrl: 'https://kiezruf.test' });
    expect(mailer.sent).toEqual([]);
    await db.update(tenant).set({ status: 'not_live' }).where(eq(tenant.path, 'de.be.bec.fk'));
  });

  it('refuses an area that is already live, or outside every tenant', async () => {
    const token = await signIn(t, newEmail());
    const live = await t.app.inject({ method: 'POST', url: '/go-live-alerts', headers: auth(token), payload: KARL_MARX_STR_100 });
    expect(live.statusCode).toBe(409);
    expect(live.json()).toEqual({ error: 'already_live' });
    const nowhere = await t.app.inject({ method: 'POST', url: '/go-live-alerts', headers: auth(token), payload: MARIENPLATZ_MUNICH });
    expect(nowhere.json()).toEqual({ error: 'no_tenant' });
  });
});

describe('account (US-34, US-35)', () => {
  it('switches the language', async () => {
    const token = await signIn(t, newEmail());
    const res = await t.app.inject({ method: 'PATCH', url: '/me', headers: auth(token), payload: { locale: 'en' } });
    expect(res.json()).toMatchObject({ locale: 'en' });
    expect((await t.app.inject({ method: 'PATCH', url: '/me', headers: auth(token), payload: { locale: 'tr' } })).statusCode).toBe(400);
  });

  it('deletes the account at once: signed out everywhere, contact removed, reports and comments kept anonymously', async () => {
    const email = newEmail();
    const phone = await signIn(t, email);
    const laptop = await signIn(t, email);
    const publicId = await postPublicReport(phone);
    await t.app.inject({ method: 'POST', url: `/reports/${publicId}/comments`, headers: auth(phone), payload: { body: 'Still broken.' } });
    await t.app.inject({ method: 'PUT', url: '/me/push-token', headers: auth(phone), payload: { token: 'ExponentPushToken[deletedaccount00]', platform: 'android' } });
    const id = await accountIdFor(email);

    expect((await t.app.inject({ method: 'DELETE', url: '/me', headers: auth(phone) })).statusCode).toBe(204);

    expect((await t.app.inject({ method: 'GET', url: '/me', headers: auth(phone) })).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'GET', url: '/me', headers: auth(laptop) })).statusCode).toBe(401);
    const [row] = await db.select({ email: account.email, deletedAt: account.deletedAt }).from(account).where(eq(account.id, id));
    expect(row).toEqual({ email: null, deletedAt: expect.any(Date) });
    expect(await db.select().from(session).where(eq(session.accountId, id))).toEqual([]);
    expect(await db.select().from(pushToken).where(eq(pushToken.accountId, id))).toEqual([]);

    const [kept] = await db.select({ createdBy: report.createdBy }).from(report).where(eq(report.publicId, publicId));
    expect(kept!.createdBy).toBeNull();
    const comments = (await t.app.inject({ method: 'GET', url: `/public/reports/${publicId}/comments` })).json().comments;
    expect(comments.map((c: { body: string }) => c.body)).toEqual(['Still broken.']);

    // The same address can sign up again as a new account.
    await t.app.inject({ method: 'POST', url: '/auth/code', payload: { email } });
    const again = await t.app.inject({ method: 'POST', url: '/auth/verify', payload: { email, code: t.mailer.lastCodeFor(email) } });
    expect(again.json()).toMatchObject({ newAccount: true });
  });
});
