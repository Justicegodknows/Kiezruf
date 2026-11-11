// Browser-side mocks for console pages in Playwright (axe checks and the console feature steps). The console is
// rendered in the browser and fetches everything from this site's /api routes, so intercepting those requests
// gives the pages realistic data without a running Kiezruf API. src/proxy.ts only checks that a staff cookie is
// present; the fake one below passes it, and the mocked /api/staff/session answers for it.
import type { BrowserContext, Page } from '@playwright/test';

export const STAFF_COOKIE = 'kiezruf_staff_session';
export const REPORT_ID = 'BE-NK-2026-0112';
export const FORWARD_TOKEN = 'fwd_0123456789abcdefghij';

const NK = { id: '11111111-1111-4111-8111-111111111111', name: 'Neukölln', path: 'de.be.bec.nk' };
const SP = { id: '22222222-2222-4222-8222-222222222222', name: 'Spandau', path: 'de.be.bec.sp' };
const BEC = { id: '33333333-3333-4333-8333-333333333333', name: 'Berlin (Stadt)', path: 'de.be.bec' };

const decay = Math.pow(0.5, 2 / (24 * 14));
/** The prototype's sample report: 4 co-reporters, 5 commenters, 20 Me too, 2 h old, 3 danger marks, safety. */
export const BREAKDOWN = {
  coReporters: 4,
  commenters: 5,
  meToo: 20,
  base: 50,
  ageHours: 2,
  decay,
  dangerMarks: 3,
  dangerMultiplier: 1.5,
  safetyCategory: true,
  safetyMultiplier: 1.3,
  score: 50 * decay * 1.5 * 1.3,
};

function grants(tenantName: string) {
  const tenant = [NK, SP, BEC].find((t) => t.name === tenantName) ?? NK;
  return { id: 'acc-cw', email: 'case.worker@bezirksamt-neukoelln.berlin.de', grants: [{ tenantId: tenant.id, tenantName: tenant.name, path: tenant.path, role: 'case_worker' }] };
}

const queue = [
  {
    publicId: REPORT_ID,
    category: 'traffic_light',
    status: 'acknowledged',
    createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    score: BREAKDOWN.score,
    level: 'Critical',
    levelChangedAt: new Date(Date.now() - 3_600_000).toISOString(),
    override: null,
    spike: true,
    counts: { coReporters: 4, commenters: 5, meToo: 20 },
    tenant: NK,
    editable: true,
  },
];

const detail = {
  ...queue[0],
  description: 'The pedestrian signal has been dark since this morning. Cars do not stop.',
  dangerous: true,
  lat: 52.4811,
  lon: 13.4353,
  photos: [],
  capture: { lat: 52.48112, lon: 13.43531, accuracyM: 8, at: new Date(Date.now() - 2 * 3_600_000).toISOString() },
  breakdown: BREAKDOWN,
  thresholds: { critical: 60, high: 25, medium: 10 },
  publicNote: 'Thanks. The fault has been passed to the team responsible for traffic signals.',
  comments: [{ id: '0b6f3f3e-6c43-4a8e-9f62-6a1f1b1f2c3d', body: 'Same on the other side of the street.', state: 'visible', flagCount: 0, createdAt: new Date().toISOString() }],
  history: [{ at: new Date(Date.now() - 2 * 3_600_000).toISOString(), kind: 'created' }],
  forwardTargets: { parents: [{ id: BEC.id, name: BEC.name }], siblings: [{ id: SP.id, name: SP.name }], contacts: [] },
};

const tenants = [
  { ...NK, parentId: null, type: 'bezirk', status: 'pilot', office: 'Bezirksamt Neukölln', thresholds: { critical: 60, high: 25, medium: 10 } },
];

/** Signs in a fake case worker of `tenantName` and serves the console's API calls from fixtures. */
export async function mockConsole(context: BrowserContext, page: Page, baseURL: string, tenantName = 'Neukölln') {
  await context.addCookies([{ name: STAFF_COOKIE, value: 'e2e_fake_staff_token_0123456789', url: baseURL, httpOnly: true, secure: false, sameSite: 'Strict' }]);
  await page.route('**/api/staff/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\//, '');
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === 'staff/session') return json({ signedIn: true, me: grants(tenantName) });
    if (path === 'staff/reports') return json({ reports: queue });
    if (path === `staff/reports/${REPORT_ID}`) return json(detail);
    if (path === 'staff/tenants') return json({ tenants });
    if (path === 'staff/moderation') return json({ comments: [], spikes: [{ publicId: REPORT_ID, category: 'traffic_light', tenant: NK, votes: 19, newAccountVotes: 15, editable: true }], heldReports: [] });
    if (path.endsWith('/contacts')) return json({ contacts: [] });
    if (path.endsWith('/staff')) return json({ staff: [] });
    return json({ error: 'not_found' }, 404);
  });
}

/** The forward-link page without the API: one live link and one expired one. */
export async function mockForwardLinks(page: Page) {
  await page.route('**/api/forwarded/**', (route) => {
    const expired = route.request().url().endsWith('expired_0123456789abcdef');
    return route.fulfill({
      status: expired ? 410 : 200,
      contentType: 'application/json',
      body: JSON.stringify(
        expired
          ? { error: 'link_expired' }
          : { publicId: 'BE-SP-2026-0229', category: 'pothole', status: 'forwarded', description: 'Deep hole in the bike lane.', lat: 52.535, lon: 13.2, createdAt: new Date().toISOString(), tenantName: 'Spandau', office: 'Bezirksamt Spandau', photos: [], publicNote: 'Passed to the VLB.' },
      ),
    });
  });
}
