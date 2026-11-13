// Admin console API (Phase 2) against the real migrations and tenant seed. Phase exit criterion: a case worker
// triages a Neukölln report end to end with no access to Spandau.
import { scoreBreakdown } from '@kiezruf/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../src/db/client.js';
import { account, notification, report, reportScore, staffRole, tenant } from '../../src/db/schema.js';
import { recomputeScores } from '../../src/scoring/recompute.js';
import { accessToken, authUserIdFor } from '../support/tokens.js';
import { buildTestApp, signIn, uploadPhotos, type TestApp } from '../support/app.js';
import { createMigratedDatabase } from './helpers.js';

const KARL_MARX_STR_100 = { lat: 52.4795, lon: 13.4365 };
const RATHAUS_SPANDAU = { lat: 52.5352, lon: 13.2 };

let db: Db;
let t: TestApp;
const bannedUsers: string[] = [];
const deletedUsers: string[] = [];
/** Supabase users the API created for invitations, by email, with their temporary password. */
const supabaseUsers = new Map<string, string>();
let n = 0;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
async function grant(email: string, path: string, role: 'platform_admin' | 'tenant_admin' | 'case_worker' | 'viewer') {
  const [row] = await db.execute<{ id: string }>(sql`
    INSERT INTO account (email) VALUES (${email}) ON CONFLICT ((lower(email))) DO UPDATE SET email = account.email RETURNING id`);
  const [node] = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.path, path));
  await db.insert(staffRole).values({ accountId: row!.id, tenantId: node!.id, role }).onConflictDoNothing();
  return row!.id;
}

/** A Supabase session after the password and the authenticator (aal2), as invited staff get it (ENG-22, ENG-24). */
async function staffSignIn(email: string): Promise<string> {
  return accessToken({ email, mfa: true, invited: true });
}

async function postReport(token: string, at = KARL_MARX_STR_100, category = 'pothole', publish = true): Promise<string> {
  const res = await t.app.inject({
    method: 'POST',
    url: '/reports',
    headers: auth(token),
    payload: { category, capture: { ...at, accuracyM: 10, capturedAt: new Date().toISOString() }, photoKeys: await uploadPhotos(t, token) },
  });
  if (res.statusCode !== 201) throw new Error(res.body);
  if (publish) await db.update(report).set({ status: 'open' }).where(eq(report.publicId, res.json().publicId));
  return res.json().publicId;
}

const get = (token: string, url: string) => t.app.inject({ method: 'GET', url, headers: auth(token) });
const send = (token: string, method: 'PATCH' | 'PUT' | 'POST' | 'DELETE', url: string, payload?: object) =>
  t.app.inject({ method, url, headers: auth(token), payload });

let citizen: string;
let nkWorker: string;
let spAdmin: string;
let berlinViewer: string;
let platform: string;
let nkReport: string;
let spReport: string;

beforeAll(async () => {
  db = await createMigratedDatabase('staff', { seed: true });
  t = await buildTestApp(db, {
    supabaseAdmin: {
      // Like Supabase: one user per address; the id is the one the test tokens use for that address.
      createInvitedUser: async (email, password) => {
        if (supabaseUsers.has(email)) return null;
        supabaseUsers.set(email, password);
        return { id: authUserIdFor(email) };
      },
      deleteUser: async (id) => void deletedUsers.push(id),
      banUser: async (id) => void bannedUsers.push(id),
    },
  });
  citizen = await signIn(t, 'citizen@example.org');
  nkReport = await postReport(citizen);
  spReport = await postReport(citizen, RATHAUS_SPANDAU, 'street_lighting');
  await grant('caseworker@neukoelln.example', 'de.be.bec.nk', 'case_worker');
  await grant('admin@spandau.example', 'de.be.bec.sp', 'tenant_admin');
  await grant('viewer@berlin.example', 'de.be', 'viewer');
  await grant('platform@kiezruf.example', 'de', 'platform_admin');
  nkWorker = await staffSignIn('caseworker@neukoelln.example');
  spAdmin = await staffSignIn('admin@spandau.example');
  berlinViewer = await staffSignIn('viewer@berlin.example');
  platform = await staffSignIn('platform@kiezruf.example');
  await recomputeScores(db);
});
afterAll(async () => {
  await t?.app.close();
  await db?.$client.end();
});

describe('staff sign-in with Supabase MFA (ENG-22)', () => {
  it('needs a TOTP check in this session, at most 12 hours old', async () => {
    const email = 'caseworker@neukoelln.example';
    const withoutMfa = await get(accessToken({ email }), '/staff/me');
    expect(withoutMfa.statusCode).toBe(401);
    expect(withoutMfa.json()).toEqual({ error: 'mfa_required' });
    const stale = await get(accessToken({ email, mfa: true, invited: true, mfaAgeSeconds: 13 * 3600 }), '/staff/me');
    expect(stale.json()).toEqual({ error: 'mfa_required' });
    expect((await get(accessToken({ email, mfa: true, invited: true }), '/staff/me')).statusCode).toBe(200);
  });

  it('refuses accounts without a role, and citizen tokens on staff routes', async () => {
    const res = await get(accessToken({ email: 'citizen@example.org', mfa: true }), '/staff/reports');
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'not_staff' });
    expect((await get(citizen, '/staff/reports')).json()).toEqual({ error: 'mfa_required' });
  });

  it('links an invited staff member to their Supabase user on first sign-in', async () => {
    const email = `invited${++n}@neukoelln.example`;
    const accountId = await grant(email, 'de.be.bec.nk', 'case_worker');
    const me = (await get(await staffSignIn(email), '/staff/me')).json();
    expect(me).toMatchObject({ id: accountId, email });
    const [row] = await db.select({ authUserId: account.authUserId }).from(account).where(eq(account.id, accountId));
    expect(row!.authUserId).toBe(authUserIdFor(email));
  });

  it('lets a staff session use citizen routes too (one Supabase session)', async () => {
    expect((await get(nkWorker, '/me')).statusCode).toBe(200);
  });

  it('lists the caller\'s grants', async () => {
    const me = (await get(spAdmin, '/staff/me')).json();
    expect(me).toEqual({
      id: expect.any(String),
      email: 'admin@spandau.example',
      grants: [{ tenantId: expect.any(String), tenantName: 'Spandau', path: 'de.be.bec.sp', role: 'tenant_admin' }],
      preferences: { briefingEmail: true },
    });
  });
});

describe('staff endpoints stay inside the caller subtree (US-42)', () => {
  it('GET /staff/reports returns only reports inside the caller subtree', async () => {
    const ids = (await get(nkWorker, '/staff/reports?status=all')).json().reports.map((r: { publicId: string }) => r.publicId);
    expect(ids).toContain(nkReport);
    expect(ids.every((id: string) => id.startsWith('BE-NK-'))).toBe(true);
  });

  it('GET /staff/reports/:id answers 404 for a Spandau report and a Neukölln case worker', async () => {
    expect((await get(nkWorker, `/staff/reports/${spReport}`)).statusCode).toBe(404);
  });

  it('PATCH answers 404 for a report outside the subtree', async () => {
    const res = await send(nkWorker, 'PATCH', `/staff/reports/${spReport}/status`, { status: 'acknowledged' });
    expect(res.statusCode).toBe(404);
  });

  it('a Berlin viewer reads both Bezirke but changes nothing; a platform admin neither triages', async () => {
    const tenants = new Set((await get(berlinViewer, '/staff/reports?status=all')).json().reports.map((r: { tenant: { name: string } }) => r.tenant.name));
    expect(tenants).toEqual(new Set(['Neukölln', 'Spandau']));
    for (const token of [berlinViewer, platform]) {
      const res = await send(token, 'PATCH', `/staff/reports/${nkReport}/status`, { status: 'acknowledged' });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'read_only' });
    }
  });
});

describe('priority queue and breakdown (US-22 to US-25)', () => {
  it('sorts by score and shows the level, which citizens never see', async () => {
    const busy = await postReport(citizen, KARL_MARX_STR_100, 'traffic_light');
    for (let i = 0; i < 12; i++) {
      const voter = await signIn(t, `voter${++n}@example.org`);
      await db.execute(sql`UPDATE account SET created_at = now() - interval '30 days' WHERE lower(email) = ${`voter${n}@example.org`}`);
      await send(voter, 'PUT', `/reports/${busy}/me-too`, { ...KARL_MARX_STR_100, accuracyM: 10 });
    }
    await recomputeScores(db);
    const queue = (await get(nkWorker, '/staff/reports')).json();
    expect(queue.reports[0]).toMatchObject({ publicId: busy, level: 'Medium', editable: true, meTooCount: 12 });
    expect(queue.reports[0].score).toBeGreaterThan(queue.reports[1].score);
    expect(queue.total).toBe(queue.reports.length);
    const citizenView = (await t.app.inject({ method: 'GET', url: `/public/reports/${busy}` })).json();
    expect(citizenView).not.toHaveProperty('score');
    expect(citizenView).not.toHaveProperty('level');
  });

  it('filters by level, category and tenant', async () => {
    const byLevel = (await get(berlinViewer, '/staff/reports?level=Medium')).json().reports;
    expect(byLevel.every((r: { level: string }) => r.level === 'Medium')).toBe(true);
    const byCategory = (await get(berlinViewer, '/staff/reports?category=street_lighting')).json().reports;
    expect(byCategory.map((r: { publicId: string }) => r.publicId)).toEqual([spReport]);
    const [sp] = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.path, 'de.be.bec.sp'));
    const byTenant = (await get(berlinViewer, `/staff/reports?tenantId=${sp!.id}`)).json().reports;
    expect(byTenant.every((r: { tenant: { name: string } }) => r.tenant.name === 'Spandau')).toBe(true);
  });

  it('shows a breakdown whose factors multiply to the shown score', async () => {
    const detail = (await get(nkWorker, `/staff/reports/${nkReport}`)).json();
    const b = detail.breakdown;
    expect(b.base * b.decay * b.dangerMultiplier * b.safetyMultiplier).toBeCloseTo(detail.score, 6);
    expect(scoreBreakdown(b).score).toBeCloseTo(detail.score, 6);
    expect(b.safetyCategory).toBe(true); // pothole
    expect(detail.thresholds).toEqual({ critical: 60, high: 25, medium: 10 });
    expect(detail.photos[0]).toEqual({ url: null, originalUrl: expect.stringContaining('signature=download'), blurStatus: 'pending' });
    expect(detail.capture).toMatchObject({ accuracyM: 10 });
  });
});

describe('status, public note and override (US-27, US-28)', () => {
  it('changes the status with a public note that citizens see, notifies followers and logs it', async () => {
    const res = await send(nkWorker, 'PATCH', `/staff/reports/${nkReport}/status`, { status: 'acknowledged', publicNote: 'Straßen- und Grünflächenamt informiert.' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'acknowledged', publicNote: 'Straßen- und Grünflächenamt informiert.' });
    const citizenView = (await t.app.inject({ method: 'GET', url: `/public/reports/${nkReport}` })).json();
    expect(citizenView).toMatchObject({ status: 'acknowledged', publicNote: 'Straßen- und Grünflächenamt informiert.' });
    const queued = await db.select().from(notification).innerJoin(report, eq(report.id, notification.reportId)).where(eq(report.publicId, nkReport));
    expect(queued.length).toBeGreaterThan(0);
    const history = (await get(nkWorker, `/staff/reports/${nkReport}`)).json().history;
    expect(history.at(-1)).toMatchObject({ kind: 'status', from: 'open', to: 'acknowledged' });
  });

  it('needs a reason to reject, and refuses a no-op', async () => {
    expect((await send(nkWorker, 'PATCH', `/staff/reports/${nkReport}/status`, { status: 'rejected' })).json()).toEqual({ error: 'reason_required' });
    expect((await send(nkWorker, 'PATCH', `/staff/reports/${nkReport}/status`, { status: 'acknowledged' })).json()).toEqual({ error: 'invalid_transition' });
  });

  it('overrides the level with a required reason, stamps the change, and clears it', async () => {
    expect((await send(nkWorker, 'PUT', `/staff/reports/${nkReport}/override`, { level: 'Critical' })).json()).toEqual({ error: 'reason_required' });
    const before = (await db.select().from(reportScore).innerJoin(report, eq(report.id, reportScore.reportId)).where(eq(report.publicId, nkReport)))[0]!.report_score;
    const res = await send(nkWorker, 'PUT', `/staff/reports/${nkReport}/override`, { level: 'Critical', reason: 'School route' });
    expect(res.json()).toEqual({ level: 'Critical', override: { level: 'Critical', reason: 'School route' } });
    await recomputeScores(db);
    const after = (await get(nkWorker, `/staff/reports/${nkReport}`)).json();
    expect(after).toMatchObject({ level: 'Critical', override: { level: 'Critical', reason: 'School route' } });
    expect(new Date(after.levelChangedAt).getTime()).toBeGreaterThan(before.levelChangedAt.getTime());

    await send(nkWorker, 'PUT', `/staff/reports/${nkReport}/override`, { level: null });
    await recomputeScores(db);
    expect((await get(nkWorker, `/staff/reports/${nkReport}`)).json()).toMatchObject({ override: null });
  });
});

describe('vote spikes (US-26, US-37)', () => {
  it('flags 19 votes in 40 minutes with 15 from new accounts, halves them, and lets a moderator clear it', async () => {
    const target = await postReport(citizen, KARL_MARX_STR_100, 'bike_lane');
    const [r] = await db.select({ id: report.id }).from(report).where(eq(report.publicId, target));
    for (let i = 0; i < 19; i++) {
      const fresh = i < 15;
      const [a] = await db.execute<{ id: string }>(sql`
        INSERT INTO account (email, created_at) VALUES (${`spiker${++n}@example.org`}, now() - ${fresh ? sql`interval '1 day'` : sql`interval '60 days'`}) RETURNING id`);
      await db.execute(sql`
        INSERT INTO reaction (report_id, account_id, kind, created_at) VALUES (${r!.id}, ${a!.id}, 'me_too', now() - make_interval(mins => ${40 - i * 2}))`);
    }
    await recomputeScores(db);
    let detail = (await get(nkWorker, `/staff/reports/${target}`)).json();
    expect(detail).toMatchObject({ spike: true, spikeState: 'flagged' });
    expect(detail.breakdown.meToo).toBe(4 + 15 * 0.5);
    const moderation = (await get(nkWorker, '/staff/moderation')).json();
    expect(moderation.spikes.map((s: { publicId: string }) => s.publicId)).toContain(target);

    expect((await send(nkWorker, 'POST', `/staff/reports/${target}/spike`, { action: 'clear', reason: 'Neighbourhood meeting, all real' })).statusCode).toBe(200);
    await recomputeScores(db);
    detail = (await get(nkWorker, `/staff/reports/${target}`)).json();
    expect(detail).toMatchObject({ spike: false, spikeState: 'cleared' });
    expect(detail.breakdown.meToo).toBe(19);
  });
});

describe('forwarding (US-45)', () => {
  it('forwards by email to a saved contact with a login-free link that expires after 90 days', async () => {
    const [berlin] = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.path, 'de.be'));
    const contact = await send(platform, 'POST', `/staff/tenants/${berlin!.id}/contacts`, { name: 'Verkehrslenkung Berlin', email: 'vlb@example.org' });
    expect(contact.statusCode).toBe(201);
    const target = await postReport(citizen, RATHAUS_SPANDAU, 'road_sign');
    const options = (await get(spAdmin, `/staff/reports/${target}`)).json().forwardTargets;
    expect(options.contacts).toEqual([{ id: contact.json().id, name: 'Verkehrslenkung Berlin' }]);

    const before = t.mailer.sent.length;
    const res = await send(spAdmin, 'POST', `/staff/reports/${target}/forward`, { contactId: contact.json().id, publicNote: 'An die Verkehrslenkung Berlin weitergeleitet.' });
    expect(res.statusCode).toBe(200);
    const mails = t.mailer.sent.slice(before);
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: 'vlb@example.org', subject: expect.stringContaining(target) });
    const link = /https:\/\/kiezruf\.test\/forwarded\/([A-Za-z0-9_-]+)/.exec(mails[0]!.text)![1]!;
    expect(mails[0]!.text).toMatch(/Ort: 52\.\d+, 13\.\d+/);

    const opened = await t.app.inject({ method: 'GET', url: `/forwarded/${link}` });
    expect(opened.statusCode).toBe(200);
    expect(opened.json()).toMatchObject({ publicId: target, status: 'forwarded', publicNote: 'An die Verkehrslenkung Berlin weitergeleitet.', photos: [] });
    expect(opened.json()).not.toHaveProperty('score');
    expect((await t.app.inject({ method: 'GET', url: `/public/reports/${target}` })).json().status).toBe('forwarded');

    await db.execute(sql`UPDATE forward SET expires_at = now() - interval '1 day' WHERE contact_id = ${contact.json().id}`);
    const expired = await t.app.inject({ method: 'GET', url: `/forwarded/${link}` });
    expect(expired.statusCode).toBe(410);
    expect(expired.json()).toEqual({ error: 'link_expired' });
  });

  it('forwards to a sibling tenant, which takes it over; the original queue keeps it read-only', async () => {
    const target = await postReport(citizen);
    const [sp] = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.path, 'de.be.bec.sp'));
    const [fk] = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.path, 'de.be.bec.fk'));
    expect((await send(nkWorker, 'POST', `/staff/reports/${target}/forward`, { tenantId: fk!.id, publicNote: 'x' })).json()).toEqual({ error: 'invalid_target' });
    expect((await send(nkWorker, 'POST', `/staff/reports/${target}/forward`, { tenantId: sp!.id, publicNote: 'Zuständig ist Spandau.' })).statusCode).toBe(200);

    const forNk = (await get(nkWorker, `/staff/reports/${target}`)).json();
    expect(forNk).toMatchObject({ editable: false, forwardedFrom: 'Neukölln', tenant: { name: 'Spandau', path: 'de.be.bec.sp', type: 'bezirk' }, status: 'forwarded' });
    expect((await send(nkWorker, 'PATCH', `/staff/reports/${target}/status`, { status: 'acknowledged' })).json()).toEqual({ error: 'read_only' });
    expect((await send(spAdmin, 'PATCH', `/staff/reports/${target}/status`, { status: 'acknowledged' })).statusCode).toBe(200);
  });
});

describe('merging duplicates (US-17)', () => {
  it('moves votes without double counting and makes the duplicate\'s author a co-reporter', async () => {
    const other = await signIn(t, `dup-author${++n}@example.org`);
    const keep = await postReport(citizen, KARL_MARX_STR_100, 'waste_bins');
    const dup = await postReport(other, KARL_MARX_STR_100, 'waste_bins');
    const voter = await signIn(t, `dup-voter${++n}@example.org`);
    for (const id of [keep, dup]) await send(voter, 'PUT', `/reports/${id}/me-too`, { ...KARL_MARX_STR_100, accuracyM: 10 });

    const res = await send(nkWorker, 'POST', `/staff/reports/${dup}/merge`, { into: keep });
    expect(res.json()).toEqual({ mergedInto: keep });
    await recomputeScores(db);
    const kept = (await get(nkWorker, `/staff/reports/${keep}`)).json();
    expect(kept).toMatchObject({ meTooCount: 1, coReporterCount: 1 });
    expect(kept.breakdown.coReporters).toBe(1);
    expect((await get(nkWorker, `/staff/reports/${dup}`)).json()).toMatchObject({ status: 'merged', mergedInto: keep });
    expect((await t.app.inject({ method: 'GET', url: `/public/reports/${dup}` })).statusCode).toBe(404);
    expect((await send(nkWorker, 'POST', `/staff/reports/${keep}/merge`, { into: spReport })).statusCode).toBe(404);
  });
});

describe('moderation (US-33)', () => {
  it('restores a held comment and bans an account', async () => {
    const author = await signIn(t, `rude${++n}@example.org`);
    const target = await postReport(citizen);
    const held = (await send(author, 'POST', `/reports/${target}/comments`, { body: 'Was für ein Arschloch-Fahrer' })).json();
    expect(held.held).toBe(true);
    const queue = (await get(nkWorker, '/staff/moderation')).json();
    const item = queue.comments.find((c: { id: string }) => c.id === held.id);
    expect(item).toMatchObject({ state: 'held', reportPublicId: target, editable: true });

    expect((await send(nkWorker, 'PATCH', `/staff/comments/${held.id}`, { state: 'visible', reason: 'Quotes a sign' })).statusCode).toBe(200);
    const visible = (await t.app.inject({ method: 'GET', url: `/public/reports/${target}/comments` })).json().comments;
    expect(visible.map((c: { id: string }) => c.id)).toContain(held.id);

    // Case workers cannot ban; tenant admins can, and only citizens.
    expect((await send(nkWorker, 'POST', `/staff/accounts/${item.accountId}/ban`, { reason: 'spam' })).statusCode).toBe(403);
    expect((await send(spAdmin, 'POST', `/staff/accounts/${item.accountId}/ban`, { reason: 'Repeated insults' })).statusCode).toBe(204);
    expect((await get(author, '/me')).statusCode).toBe(401);
    // The Supabase sign-in is banned too, so no new session can be started.
    expect(bannedUsers).toEqual([authUserIdFor(`rude${n}@example.org`)]);
    const [nkWorkerId] = await db.select({ id: account.id }).from(account).where(eq(account.email, 'caseworker@neukoelln.example'));
    expect((await send(spAdmin, 'POST', `/staff/accounts/${nkWorkerId!.id}/ban`, { reason: 'x' })).statusCode).toBe(403);
  });
});

describe('tenants and roles (US-40, US-42, US-46)', () => {
  it('lists the tenants in scope with what the caller may do', async () => {
    const tenants = (await get(spAdmin, '/staff/tenants')).json().tenants;
    expect(tenants).toEqual([expect.objectContaining({ name: 'Spandau', status: 'pilot', canAdmin: true, canActivate: false })]);
    expect((await get(platform, '/staff/tenants')).json().tenants).toHaveLength(15);
  });

  it('lets only a platform admin switch a node live', async () => {
    const [mi] = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.path, 'de.be.bec.mi'));
    expect((await send(spAdmin, 'PATCH', `/staff/tenants/${mi!.id}`, { status: 'pilot' })).statusCode).toBe(403);
    expect((await send(platform, 'PATCH', `/staff/tenants/${mi!.id}`, { status: 'pilot' })).json()).toEqual({ status: 'pilot' });
    expect((await send(platform, 'PATCH', `/staff/tenants/${mi!.id}`, { status: 'not_live' })).statusCode).toBe(200);
  });

  it('refuses to switch on a node without a boundary', async () => {
    const [de] = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.path, 'de'));
    expect((await send(platform, 'PATCH', `/staff/tenants/${de!.id}`, { status: 'pilot' })).json()).toEqual({ error: 'invalid_target' });
  });

  it('lists and removes external contacts, admins only', async () => {
    const [sp] = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.path, 'de.be.bec.sp'));
    const added = (await send(spAdmin, 'POST', `/staff/tenants/${sp!.id}/contacts`, { name: 'BSR', email: 'bsr@example.org' })).json();
    expect((await get(spAdmin, `/staff/tenants/${sp!.id}/contacts`)).json().contacts).toEqual([
      { id: added.id, name: 'BSR', email: 'bsr@example.org', createdAt: expect.any(String) },
    ]);
    expect((await send(berlinViewer, 'DELETE', `/staff/tenants/${sp!.id}/contacts/${added.id}`)).statusCode).toBe(403);
    expect((await send(spAdmin, 'DELETE', `/staff/tenants/${sp!.id}/contacts/${added.id}`)).statusCode).toBe(204);
    expect((await get(spAdmin, `/staff/tenants/${sp!.id}/contacts`)).json().contacts).toEqual([]);
  });

  it('sets thresholds and the office name, and refuses thresholds that do not fall', async () => {
    const [sp] = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.path, 'de.be.bec.sp'));
    expect((await send(spAdmin, 'PUT', `/staff/tenants/${sp!.id}/settings`, { thresholds: { critical: 10, high: 25, medium: 5 } })).statusCode).toBe(400);
    expect((await send(spAdmin, 'PUT', `/staff/tenants/${sp!.id}/settings`, { thresholds: { critical: 40, high: 20, medium: 5 }, office: 'Bezirksamt Spandau, Ordnungsamt' })).statusCode).toBe(204);
    const detail = (await get(spAdmin, `/staff/reports/${spReport}`)).json();
    expect(detail.thresholds).toEqual({ critical: 40, high: 20, medium: 5 });
    expect((await send(nkWorker, 'PUT', `/staff/tenants/${sp!.id}/settings`, { office: 'x' })).statusCode).toBe(403);
  });

  it('invites staff by email, lists and removes them, and keeps platform_admin for platform admins', async () => {
    const [sp] = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.path, 'de.be.bec.sp'));
    // Refused after the Supabase user was made: the user is removed again.
    expect((await send(spAdmin, 'POST', `/staff/tenants/${sp!.id}/staff`, { email: 'new@spandau.example', role: 'platform_admin' })).json()).toEqual({ error: 'forbidden_role' });
    expect(deletedUsers).toEqual([authUserIdFor('new@spandau.example')]);
    supabaseUsers.delete('new@spandau.example');

    const invited = await send(spAdmin, 'POST', `/staff/tenants/${sp!.id}/staff`, { email: 'New@Spandau.example', role: 'case_worker' });
    expect(invited.statusCode).toBe(201);
    // The temporary password goes to the inviting admin once, matches the Supabase user, and is not in the email.
    const temporaryPassword = invited.json().temporaryPassword as string;
    expect(temporaryPassword).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(supabaseUsers.get('new@spandau.example')).toBe(temporaryPassword);
    expect(t.mailer.sent.at(-1)).toMatchObject({ to: 'new@spandau.example', text: expect.stringContaining('https://kiezruf.test/console') });
    expect(t.mailer.sent.at(-1)!.text).not.toContain(temporaryPassword);
    const staff = (await get(spAdmin, `/staff/tenants/${sp!.id}/staff`)).json().staff;
    expect(staff.map((s: { email: string }) => s.email).sort()).toEqual(['admin@spandau.example', 'new@spandau.example']);

    const newToken = await staffSignIn('new@spandau.example');
    expect((await get(newToken, '/staff/reports')).statusCode).toBe(200);
    // A second role for someone who is already staff: no new sign-in, no password.
    const again = await send(spAdmin, 'POST', `/staff/tenants/${sp!.id}/staff`, { email: 'new@spandau.example', role: 'viewer' });
    expect(again.statusCode).toBe(201);
    expect(again.json().temporaryPassword).toBeUndefined();
    expect((await send(spAdmin, 'DELETE', `/staff/tenants/${sp!.id}/staff/${invited.json().accountId}`)).statusCode).toBe(204);
    expect((await get(newToken, '/staff/reports')).statusCode).toBe(403);
  });

  it('refuses to invite an address a self-registered citizen holds (no email proof, ENG-24)', async () => {
    const [sp] = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.path, 'de.be.bec.sp'));
    const email = `squatter${++n}@spandau.example`;
    expect((await get(accessToken({ email }), '/me')).statusCode).toBe(200);
    const res = await send(spAdmin, 'POST', `/staff/tenants/${sp!.id}/staff`, { email, role: 'case_worker' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'email_taken' });
    expect(supabaseUsers.has(email)).toBe(false);
    expect((await get(accessToken({ email, mfa: true }), '/staff/reports')).json()).toEqual({ error: 'not_staff' });
  });

  it('does not let a self-registered user take over an invited account with the same address', async () => {
    const email = `pending${++n}@neukoelln.example`;
    await grant(email, 'de.be.bec.nk', 'case_worker');
    // Signed up on their own (no kiezruf_invited mark): no account, no staff role.
    const res = await get(accessToken({ email, mfa: true }), '/staff/me');
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'email_taken' });
    const [row] = await db.select({ authUserId: account.authUserId }).from(account).where(eq(account.email, email));
    expect(row!.authUserId).toBeNull();
  });
});
