// Console pages against a mocked BFF: Supabase sign-in with TOTP, queue filters, and which actions each role is offered.
// Also the forward-link page and the office note on the citizen report detail.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/auth/AuthProvider';
import { ReportDetailView } from '@/components/ReportDetailView';
import { ForwardedView } from '@/console/pages/ForwardedReport';
import { ModerationPage } from '@/console/pages/ModerationPage';
import { QueuePage } from '@/console/pages/QueuePage';
import { ReportPage } from '@/console/pages/ReportPage';
import { SignInPage } from '@/console/pages/SignInPage';
import { TenantsPage } from '@/console/pages/TenantsPage';
import { RequireStaff, StaffProvider } from '@/console/StaffProvider';
import type { StaffRole } from '@/console/types';
import { I18nProvider } from '@/i18n/I18nProvider';
import de from '@/i18n/de.json';
import { mockFetch } from './helpers';

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  search: '',
  pathname: '/console',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => nav.pathname,
  useParams: () => ({}),
}));
// jsdom has no WebGL: the map fails quietly and the coordinates remain.
vi.mock('maplibre-gl', () => ({
  Map: class {
    constructor() {
      throw new Error('no WebGL in jsdom');
    }
  },
  Marker: class {},
}));

const ID = 'BE-NK-2026-0112';
const NK = { id: '11111111-1111-4111-8111-111111111111', name: 'Neukölln', path: 'de.be.bec.nk' };
const SP = { id: '22222222-2222-4222-8222-222222222222', name: 'Spandau', path: 'de.be.bec.sp' };
const BEC = { id: '33333333-3333-4333-8333-333333333333', name: 'Berlin (Stadt)', path: 'de.be.bec' };
const TENANTS = [
  { ...BEC, parentId: null, type: 'kreisfreie_stadt', status: 'grouping', office: null, thresholds: null },
  { ...NK, parentId: BEC.id, type: 'bezirk', status: 'pilot', office: 'Bezirksamt Neukölln', thresholds: { critical: 60, high: 25, medium: 10 } },
  { ...SP, parentId: BEC.id, type: 'bezirk', status: 'pilot', office: 'Bezirksamt Spandau', thresholds: null },
];

function me(role: StaffRole, tenant: { id: string; name: string; path: string }) {
  return { id: 'acc-me', email: 'me@bezirksamt.berlin.de', grants: [{ tenantId: tenant.id, tenantName: tenant.name, path: tenant.path, role }] };
}

const COMMENT_ID = '0b6f3f3e-6c43-4a8e-9f62-6a1f1b1f2c3d';
const AUTHOR_ID = '9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f';

function detail(editable: boolean) {
  return {
    publicId: ID,
    category: 'traffic_light',
    status: 'acknowledged',
    description: 'The pedestrian signal has been dark since this morning.',
    dangerous: true,
    lat: 52.4811,
    lon: 13.4353,
    createdAt: '2026-11-11T08:00:00Z',
    score: 97.1,
    level: 'Critical',
    levelChangedAt: '2026-11-11T09:00:00Z',
    override: null,
    spike: false,
    counts: { coReporters: 4, commenters: 5, meToo: 20 },
    tenant: NK,
    editable,
    photos: [{ blurredUrl: 'https://photos.test/blurred-1.jpg', originalUrl: 'https://photos.test/original-1.jpg?sig=x' }],
    capture: { lat: 52.48112, lon: 13.43531, accuracyM: 8, at: '2026-11-11T07:58:00Z' },
    breakdown: {
      coReporters: 4,
      commenters: 5,
      meToo: 20,
      base: 50,
      ageHours: 2,
      decay: 0.995882,
      dangerMarks: 3,
      dangerMultiplier: 1.5,
      safetyCategory: true,
      safetyMultiplier: 1.3,
      score: 97.1,
    },
    thresholds: { critical: 60, high: 25, medium: 10 },
    publicNote: 'Passed to the signals team.',
    comments: [
      { id: COMMENT_ID, body: 'You idiots', state: 'held', flags: 2, createdAt: '2026-11-11T10:00:00Z', accountId: AUTHOR_ID },
    ],
    history: [
      { at: '2026-11-11T08:00:00Z', kind: 'created' },
      { at: '2026-11-11T09:00:00Z', kind: 'status', from: 'open', to: 'acknowledged', publicNote: 'Passed to the signals team.' },
      { at: '2026-11-11T09:30:00Z', kind: 'override', from: null, to: null, reason: 'Back to normal' },
    ],
    // As the API sends it: one flat tenant list (parent first) and the contacts saved up the tree.
    forwardTargets: {
      tenants: [
        { id: BEC.id, name: 'Berlin (Stadt)', type: 'kreisfreie_stadt' },
        { id: SP.id, name: 'Spandau', type: 'bezirk' },
      ],
      contacts: [{ id: '44444444-4444-4444-8444-444444444444', name: 'Verkehrslenkung Berlin' }],
    },
  };
}

function renderConsole(ui: ReactElement, opts: { gated?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider locale="de">
        <StaffProvider>{opts.gated === false ? ui : <RequireStaff>{ui}</RequireStaff>}</StaffProvider>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  nav.replace.mockReset();
  nav.push.mockReset();
  nav.search = '';
  nav.pathname = '/console';
  window.history.replaceState(null, '', '/console');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('console sign-in: Supabase email and password, then TOTP (ENG-22, ENG-24)', () => {
  // What Supabase returns from mfa.enroll, re-encoded by the server as base64 (src/server/auth-handlers.ts).
  const QR = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';

  it('enrols an authenticator on the first sign-in: QR code from Supabase, secret as text, then the first code', async () => {
    nav.search = `next=${encodeURIComponent(`/console/reports/${ID}`)}`;
    window.history.replaceState(null, '', `/console/sign-in?${nav.search}`);
    let signedIn = false;
    const calls = mockFetch(({ method, path }) => {
      if (path === '/api/staff/session') return { body: signedIn ? { signedIn: true, me: me('case_worker', NK) } : { signedIn: false } };
      if (method === 'POST' && path === '/api/auth/sign-in') return { body: { signedIn: true, aal: 'aal1' } };
      if (method === 'POST' && path === '/api/auth/mfa') return { body: { next: 'enroll', qrCode: QR, secret: 'JBSWY3DPEHPK3PXP' } };
      if (method === 'POST' && path === '/api/auth/mfa/verify') {
        signedIn = true;
        return { body: { signedIn: true, aal: 'aal2' } };
      }
      return undefined;
    });
    renderConsole(<SignInPage />, { gated: false });

    fireEvent.change(screen.getByLabelText(de['console.signin.email']), { target: { value: 'me@bezirksamt.berlin.de' } });
    fireEvent.change(screen.getByLabelText(de['signin.password']), { target: { value: 'correct horse battery' } });
    fireEvent.click(screen.getByRole('button', { name: de['console.signin.next'] }));

    expect(await screen.findByRole('heading', { name: de['console.signin.enrollTitle'] })).toHaveFocus();
    const qr = screen.getByRole('img', { name: de['console.signin.qrAlt'] });
    expect(qr).toHaveAttribute('src', QR);
    // The secret is the QR code's text alternative (WCAG 1.1.1).
    const secret = screen.getByTestId('totp-secret');
    expect(secret).toHaveTextContent('JBSW Y3DP EHPK 3PXP');
    expect(document.getElementById(qr.getAttribute('aria-describedby')!)).toContainElement(secret);

    fireEvent.change(screen.getByLabelText(de['console.signin.totp']), { target: { value: '65a4321' } });
    fireEvent.click(screen.getByRole('button', { name: de['console.signin.enrollSubmit'] }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/console/reports/${ID}`));

    expect(calls.find((c) => c.path === '/api/auth/sign-in')?.body).toEqual({ email: 'me@bezirksamt.berlin.de', password: 'correct horse battery' });
    // Only the authenticator code: the factor and challenge stay on the server.
    expect(calls.find((c) => c.path === '/api/auth/mfa/verify')?.body).toEqual({ code: '654321' });
    expect(calls.map((c) => c.path)).not.toContain('/api/staff/auth/verify');
  });

  it('asks for the authenticator code on later sign-ins and shows a wrong code translated', async () => {
    window.history.replaceState(null, '', '/console/sign-in');
    mockFetch(({ method, path }) => {
      if (path === '/api/staff/session') return { body: { signedIn: false } };
      if (method === 'POST' && path === '/api/auth/sign-in') return { body: { signedIn: true, aal: 'aal1' } };
      if (method === 'POST' && path === '/api/auth/mfa') return { body: { next: 'totp' } };
      if (method === 'POST' && path === '/api/auth/mfa/verify') return { status: 400, body: { error: 'invalid_totp' } };
      return undefined;
    });
    renderConsole(<SignInPage />, { gated: false });
    fireEvent.change(screen.getByLabelText(de['console.signin.email']), { target: { value: 'me@bezirksamt.berlin.de' } });
    fireEvent.change(screen.getByLabelText(de['signin.password']), { target: { value: 'correct horse battery' } });
    fireEvent.click(screen.getByRole('button', { name: de['console.signin.next'] }));
    fireEvent.change(await screen.findByLabelText(de['console.signin.totp']), { target: { value: '000000' } });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText(de['console.signin.totpIntro'])).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: de['console.signin.submit'] }));
    expect(await screen.findByRole('alert')).toHaveTextContent(de['error.invalid_totp']);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('shows a wrong email or password translated', async () => {
    window.history.replaceState(null, '', '/console/sign-in');
    mockFetch(({ method, path }) => {
      if (path === '/api/staff/session') return { body: { signedIn: false } };
      if (method === 'POST' && path === '/api/auth/sign-in') return { status: 400, body: { error: 'invalid_credentials' } };
      return undefined;
    });
    renderConsole(<SignInPage />, { gated: false });
    fireEvent.change(screen.getByLabelText(de['console.signin.email']), { target: { value: 'me@bezirksamt.berlin.de' } });
    fireEvent.change(screen.getByLabelText(de['signin.password']), { target: { value: 'correct horse battery' } });
    fireEvent.click(screen.getByRole('button', { name: de['console.signin.next'] }));
    expect(await screen.findByRole('alert')).toHaveTextContent(de['error.invalid_credentials']);
  });

  it('goes straight to the TOTP step when the session exists but its TOTP check is missing or too old', async () => {
    window.history.replaceState(null, '', '/console/sign-in');
    let signedIn = false;
    const calls = mockFetch(({ method, path }) => {
      if (path === '/api/staff/session') return { body: signedIn ? { signedIn: true, me: me('case_worker', NK) } : { signedIn: false, reason: 'mfa_required' } };
      if (method === 'POST' && path === '/api/auth/mfa') return { body: { next: 'totp' } };
      if (method === 'POST' && path === '/api/auth/mfa/verify') {
        signedIn = true;
        return { body: { signedIn: true, aal: 'aal2' } };
      }
      return undefined;
    });
    renderConsole(<SignInPage />, { gated: false });
    expect(await screen.findByText(de['console.signin.mfaAgain'])).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(de['console.signin.totp']), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: de['console.signin.submit'] }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/console'));
    expect(calls.some((c) => c.path === '/api/auth/sign-in')).toBe(false);
  });

  it('tells an account without a staff role that it has no console access', async () => {
    window.history.replaceState(null, '', '/console/sign-in');
    let aal2 = false;
    mockFetch(({ method, path }) => {
      // GET /staff/me answers 403 not_staff once the session is at aal2.
      if (path === '/api/staff/session') return { body: aal2 ? { signedIn: false, reason: 'not_staff' } : { signedIn: false } };
      if (method === 'POST' && path === '/api/auth/sign-in') return { body: { signedIn: true, aal: 'aal1' } };
      if (method === 'POST' && path === '/api/auth/mfa') return { body: { next: 'totp' } };
      if (method === 'POST' && path === '/api/auth/mfa/verify') {
        aal2 = true;
        return { body: { signedIn: true, aal: 'aal2' } };
      }
      return undefined;
    });
    renderConsole(<SignInPage />, { gated: false });
    fireEvent.change(screen.getByLabelText(de['console.signin.email']), { target: { value: 'a@example.org' } });
    fireEvent.change(screen.getByLabelText(de['signin.password']), { target: { value: 'correct horse battery' } });
    fireEvent.click(screen.getByRole('button', { name: de['console.signin.next'] }));
    fireEvent.change(await screen.findByLabelText(de['console.signin.totp']), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: de['console.signin.submit'] }));
    expect(await screen.findByRole('alert')).toHaveTextContent(de['error.not_staff']);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('sends a staff member whose TOTP check expired (401 mfa_required) back to sign-in', async () => {
    window.history.replaceState(null, '', '/console/moderation');
    mockFetch(({ path }) => {
      if (path === '/api/staff/session') return { body: { signedIn: true, me: me('case_worker', NK) } };
      if (path === '/api/staff/moderation') return { status: 401, body: { error: 'mfa_required' } };
      return undefined;
    });
    renderConsole(<ModerationPage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/console/sign-in?next=%2Fconsole%2Fmoderation'));
  });

  it('sends a signed-out staff member from a console page to sign-in, coming back afterwards', async () => {
    window.history.replaceState(null, '', '/console/moderation');
    const calls = mockFetch(({ path }) => (path === '/api/staff/session' ? { body: { signedIn: false } } : undefined));
    renderConsole(<ModerationPage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/console/sign-in?next=%2Fconsole%2Fmoderation'));
    expect(calls.some((c) => c.path === '/api/staff/moderation')).toBe(false);
  });
});

describe('console: priority queue (US-25, US-43)', () => {
  const rows = [
    {
      publicId: ID,
      category: 'traffic_light',
      status: 'acknowledged',
      createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      score: 97.1,
      level: 'critical',
      levelChangedAt: '2026-11-11T09:00:00Z',
      override: { level: 'Critical', reason: 'School route' },
      spike: true,
      counts: { coReporters: 4, commenters: 5, meToo: 20 },
      tenant: { id: NK.id, name: 'Neukölln' },
      editable: false,
    },
    {
      publicId: 'BE-SP-2026-0229',
      category: 'pothole',
      status: 'open',
      createdAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      score: 12.4,
      level: 'Medium',
      override: null,
      spike: false,
      counts: { coReporters: 1, commenters: 0, meToo: 7 },
      tenant: { id: SP.id, name: 'Spandau' },
      editable: false,
    },
  ];

  it('loads by score with the filters from the URL and shows tenant column, level text and markers for a roll-up viewer', async () => {
    nav.search = `level=Critical&category=traffic_light&maxAgeDays=7&evil=1`;
    const calls = mockFetch(({ path }) => {
      if (path === '/api/staff/session') return { body: { signedIn: true, me: me('viewer', BEC) } };
      if (path === '/api/staff/tenants') return { body: { tenants: TENANTS } };
      if (path.startsWith('/api/staff/reports?')) return { body: { reports: rows } };
      return undefined;
    });
    renderConsole(<QueuePage />);
    const table = await screen.findByRole('table');
    const queueCall = calls.find((c) => c.path.startsWith('/api/staff/reports?'))!;
    const sent = new URL(queueCall.path, 'http://x').searchParams;
    expect(Object.fromEntries(sent)).toEqual({ level: 'Critical', category: 'traffic_light', maxAgeDays: '7', sort: 'score', limit: '50' });

    expect(within(table).getByRole('columnheader', { name: de['console.queue.tenant'] })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: de['console.queue.score'] })).toHaveAttribute('aria-sort', 'descending');
    const [first, second] = within(table).getAllByRole('row').slice(1);
    expect(first).toHaveTextContent('Kritisch');
    expect(first).toHaveTextContent(de['console.override.marker']);
    expect(first).toHaveTextContent(de['console.marker.spike']);
    expect(first).toHaveTextContent(de['console.marker.readOnly']);
    expect(first).toHaveTextContent('Neukölln');
    expect(first).toHaveTextContent('97,1');
    expect(within(first!).getByRole('link', { name: /Ampel, BE-NK-2026-0112/ })).toHaveAttribute('href', `/console/reports/${ID}`);
    expect(second).toHaveTextContent('Mittel');
    expect(second).toHaveTextContent('Spandau');
    expect(second).toHaveTextContent('5 Tage');
    expect(screen.getByLabelText(de['console.queue.level'])).toHaveValue('Critical');
  });

  it('puts a changed filter into the URL and starts again at the first page', async () => {
    nav.search = 'offset=50&status=open';
    mockFetch(({ path }) => {
      if (path === '/api/staff/session') return { body: { signedIn: true, me: me('viewer', BEC) } };
      if (path === '/api/staff/tenants') return { body: { tenants: TENANTS } };
      if (path.startsWith('/api/staff/reports?')) return { body: { reports: rows } };
      return undefined;
    });
    renderConsole(<QueuePage />);
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText(de['console.queue.tenant']), { target: { value: SP.id } });
    expect(nav.replace).toHaveBeenLastCalledWith(`/console?status=open&tenantId=${SP.id}`, { scroll: false });
    fireEvent.change(screen.getByLabelText(de['console.queue.sort']), { target: { value: 'age' } });
    expect(nav.replace).toHaveBeenLastCalledWith('/console?status=open&sort=age', { scroll: false });
    fireEvent.change(screen.getByLabelText(de['filters.age']), { target: { value: '30' } });
    expect(nav.replace).toHaveBeenLastCalledWith('/console?status=open&maxAgeDays=30', { scroll: false });
  });

  it('leaves out the tenant column and filter when the scope has one tenant', async () => {
    mockFetch(({ path }) => {
      if (path === '/api/staff/session') return { body: { signedIn: true, me: me('case_worker', NK) } };
      if (path === '/api/staff/tenants') return { body: { tenants: [TENANTS[1]] } };
      if (path.startsWith('/api/staff/reports?')) return { body: { reports: [{ ...rows[0], editable: true }] } };
      return undefined;
    });
    renderConsole(<QueuePage />);
    const table = await screen.findByRole('table');
    expect(within(table).queryByRole('columnheader', { name: de['console.queue.tenant'] })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(de['console.queue.tenant'])).not.toBeInTheDocument();
    expect(table).not.toHaveTextContent(de['console.marker.readOnly']);
  });
});

describe('console: report detail and permission-based actions (US-22, US-27, US-28, US-42)', () => {
  function serve(role: StaffRole, tenant: typeof NK, editable: boolean) {
    return mockFetch(({ method, path }) => {
      if (path === '/api/staff/session') return { body: { signedIn: true, me: me(role, tenant) } };
      if (path === `/api/staff/reports/${ID}`) return { body: detail(editable) };
      if (path === '/api/staff/tenants') return { body: { tenants: TENANTS } };
      if (path.startsWith('/api/staff/reports?')) return { body: { reports: [] } };
      if (method === 'PATCH' && path === `/api/staff/reports/${ID}/status`) return { body: { status: 'resolved' } };
      return undefined;
    });
  }

  it('shows a case worker of the owning tenant the breakdown, comments, history and every action', async () => {
    const calls = serve('case_worker', NK, true);
    renderConsole(<ReportPage publicId={ID} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Ampel' })).toBeInTheDocument();
    expect(screen.getByTestId('breakdown-formula')).toHaveTextContent('50 × 0,99588 × 1,5 × 1,3 = 97,1');
    expect(screen.getByRole('img', { name: /Foto 1 von 1/ })).toHaveAttribute('src', 'https://photos.test/blurred-1.jpg');
    expect(screen.getByRole('link', { name: /Original von Foto 1/ })).toHaveAttribute('href', 'https://photos.test/original-1.jpg?sig=x');
    expect(screen.getByText('You idiots')).toBeInTheDocument();
    expect(screen.getByText(de['console.comments.state.held'])).toBeInTheDocument();
    expect(screen.getByText('2-mal gemeldet')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: de['console.history.title'] }).parentElement).toHaveTextContent('Status: Gesehen');

    for (const heading of ['console.status.title', 'console.override.title', 'console.forward.title', 'console.merge.title'] as const) {
      expect(screen.getByRole('heading', { name: de[heading] })).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { name: de['console.history.title'] }).parentElement).toHaveTextContent(de['console.history.overrideCleared']);
    // Forward targets from the API's flat list: the parent and the sibling end up in their own groups.
    const forwardTo = screen.getByLabelText(de['console.forward.target']);
    await waitFor(() => expect(within(forwardTo).getByRole('group', { name: de['console.forward.parents'] })).toHaveTextContent('Berlin (Stadt)'));
    expect(within(forwardTo).getByRole('group', { name: de['console.forward.siblings'] })).toHaveTextContent('Spandau');
    expect(within(forwardTo).getByRole('group', { name: de['console.forward.contacts'] })).toHaveTextContent('Verkehrslenkung Berlin');
    expect(screen.getByRole('button', { name: de['console.comments.restore'] })).toBeInTheDocument();
    // Case workers moderate but do not ban (tenant admins only).
    expect(screen.queryByRole('button', { name: de['console.ban.button'] })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(de['console.status.label']), { target: { value: 'resolved' } });
    fireEvent.change(screen.getByLabelText(de['console.status.publicNote']), { target: { value: 'Repaired today.' } });
    fireEvent.click(screen.getByRole('button', { name: de['console.status.submit'] }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ status: 'resolved', publicNote: 'Repaired today.' }));
  });

  it('hides every action from a viewer, even on a report the API calls editable', async () => {
    serve('viewer', NK, true);
    renderConsole(<ReportPage publicId={ID} />);
    expect(await screen.findByTestId('score-breakdown')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: de['console.status.title'] })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: de['console.override.title'] })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: de['console.comments.restore'] })).not.toBeInTheDocument();
    expect(screen.getByText(de['console.report.readOnlyRole'])).toBeInTheDocument();
  });

  it('keeps a roll-up or forwarded report read-only for a case worker (not editable)', async () => {
    serve('case_worker', NK, false);
    renderConsole(<ReportPage publicId={ID} />);
    expect(await screen.findByText(de['console.report.readOnly'])).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: de['console.forward.title'] })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: de['console.merge.title'] })).not.toBeInTheDocument();
  });

  it('says not found for a report outside the scope (404, never 403)', async () => {
    mockFetch(({ path }) => {
      if (path === '/api/staff/session') return { body: { signedIn: true, me: me('case_worker', NK) } };
      if (path === '/api/staff/reports/BE-SP-2026-0229') return { status: 404, body: { error: 'not_found' } };
      return undefined;
    });
    renderConsole(<ReportPage publicId="BE-SP-2026-0229" />);
    expect(await screen.findByRole('heading', { name: de['console.report.notFound'] })).toBeInTheDocument();
  });
});

describe('console: moderation (US-26, US-33)', () => {
  // As GET /staff/moderation answers.
  const queue = {
    comments: [
      { id: COMMENT_ID, body: 'You idiots', state: 'held', flags: 3, createdAt: '2026-11-11T10:00:00Z', accountId: AUTHOR_ID, reportPublicId: ID, tenantName: 'Neukölln', editable: true },
    ],
    spikes: [{ publicId: ID, tenantName: 'Neukölln', spikeState: 'flagged', score: 97.1, meTooCount: 19, editable: true }],
    held: [{ publicId: 'BE-NK-2026-0120', tenantName: 'Neukölln', createdAt: '2026-11-11T07:00:00Z' }],
  };

  it('lets a tenant admin remove a comment with a reason and ban its author', async () => {
    const calls = mockFetch(({ method, path }) => {
      if (path === '/api/staff/session') return { body: { signedIn: true, me: me('tenant_admin', NK) } };
      if (path === '/api/staff/moderation') return { body: queue };
      if (method === 'PATCH' && path === `/api/staff/comments/${COMMENT_ID}`) return { body: { state: 'removed' } };
      if (method === 'POST' && path === `/api/staff/accounts/${AUTHOR_ID}/ban`) return { status: 204 };
      return undefined;
    });
    renderConsole(<ModerationPage />);
    expect(await screen.findByText('You idiots')).toBeInTheDocument();
    expect(screen.getByText('19 Stimmen')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'BE-NK-2026-0120' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: ID })).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: de['console.comments.remove'] }));
    const dialog = await screen.findByRole('dialog', { name: 'Kommentar 1 entfernen' });
    fireEvent.click(within(dialog).getByRole('button', { name: de['console.comments.remove'] }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(de['console.reasonRequired']);
    fireEvent.change(within(dialog).getByLabelText(de['console.reason']), { target: { value: 'Insult' } });
    fireEvent.click(within(dialog).getByRole('button', { name: de['console.comments.remove'] }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ state: 'removed', reason: 'Insult' }));

    fireEvent.click(screen.getByRole('button', { name: de['console.ban.button'] }));
    const ban = await screen.findByRole('dialog', { name: de['console.ban.title'] });
    fireEvent.change(within(ban).getByLabelText(de['console.reason']), { target: { value: 'Repeated insults' } });
    fireEvent.click(within(ban).getByRole('button', { name: de['console.ban.button'] }));
    await waitFor(() => expect(calls.find((c) => c.path.endsWith('/ban'))?.body).toEqual({ reason: 'Repeated insults' }));
  });

  it('confirms a vote spike with a reason', async () => {
    const calls = mockFetch(({ method, path }) => {
      if (path === '/api/staff/session') return { body: { signedIn: true, me: me('case_worker', NK) } };
      if (path === '/api/staff/moderation') return { body: queue };
      if (method === 'POST' && path === `/api/staff/reports/${ID}/spike`) return { body: { spike: 'confirmed' } };
      return undefined;
    });
    renderConsole(<ModerationPage />);
    fireEvent.change(await screen.findByLabelText(de['console.spike.reason']), { target: { value: '15 accounts from one night' } });
    fireEvent.click(screen.getByRole('button', { name: de['console.spike.confirm'] }));
    await waitFor(() => expect(calls.find((c) => c.path.endsWith('/spike'))?.body).toEqual({ action: 'confirm', reason: '15 accounts from one night' }));
    expect(screen.queryByRole('button', { name: de['console.ban.button'] })).not.toBeInTheDocument();
  });

  it('shows a viewer the queue without any action', async () => {
    mockFetch(({ path }) => {
      if (path === '/api/staff/session') return { body: { signedIn: true, me: me('viewer', BEC) } };
      if (path === '/api/staff/moderation') return { body: queue };
      return undefined;
    });
    renderConsole(<ModerationPage />);
    expect(await screen.findByText('You idiots')).toBeInTheDocument();
    expect(screen.getByText(de['console.moderation.readOnly'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: de['console.comments.remove'] })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: de['console.spike.confirm'] })).not.toBeInTheDocument();
  });
});

describe('console: tenants & roles (US-40, US-42, US-46)', () => {
  function serve(role: StaffRole, scope: typeof NK) {
    return mockFetch(({ method, path }) => {
      if (path === '/api/staff/session') return { body: { signedIn: true, me: me(role, scope) } };
      if (path === '/api/staff/tenants') return { body: { tenants: role === 'platform_admin' ? TENANTS : TENANTS.filter((t) => t.path.startsWith(scope.path)) } };
      if (path.endsWith('/contacts') && method === 'GET') return { body: { contacts: [{ id: 'c1', name: 'Verkehrslenkung Berlin', email: 'vlb@berlin.de' }] } };
      if (path.endsWith('/staff') && method === 'GET') return { body: { staff: [{ accountId: 'acc-me', email: 'me@bezirksamt.berlin.de', role }] } };
      if (method === 'POST' && path.endsWith('/staff')) return { status: 201, body: { accountId: 'acc-new', role: 'case_worker', temporaryPassword: 'Tmp-Pass_1234567' } };
      if (method === 'PUT' && path.endsWith('/settings')) return { body: {} };
      return undefined;
    });
  }

  it('lets a tenant admin set thresholds and invite staff, but not activate the node', async () => {
    const calls = serve('tenant_admin', NK);
    renderConsole(<TenantsPage />);
    expect(await screen.findByRole('heading', { level: 2, name: 'Neukölln' })).toBeInTheDocument();
    expect(screen.queryByLabelText(de['console.tenants.status'])).not.toBeInTheDocument();
    expect(screen.getByText(`${de['console.tenants.status']}:`, { exact: false }).parentElement).toHaveTextContent('Status: Pilot');

    const critical = screen.getByLabelText(de['console.tenants.critical']);
    fireEvent.change(critical, { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: de['console.tenants.saveSettings'] }));
    expect(await screen.findByRole('alert')).toHaveTextContent(de['console.tenants.thresholdsInvalid']);
    fireEvent.change(critical, { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: de['console.tenants.saveSettings'] }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ thresholds: { critical: 50, high: 25, medium: 10 }, office: 'Bezirksamt Neukölln' }),
    );

    const role = await screen.findByLabelText(de['console.staff.role']);
    expect(within(role).getAllByRole('option').map((o) => o.textContent)).toEqual(['Mandanten-Admin', 'Sachbearbeitung', 'Nur lesen']);
    fireEvent.change(screen.getByLabelText(de['console.staff.email']), { target: { value: 'new@bezirksamt.berlin.de' } });
    fireEvent.click(screen.getByRole('button', { name: de['console.staff.invite'] }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ email: 'new@bezirksamt.berlin.de', role: 'case_worker' }));
    // The invited person's first password is shown once to the admin (ENG-24).
    const shown = await screen.findByTestId('first-password');
    expect(shown).toHaveTextContent('Tmp-Pass_1234567');
    expect(shown.closest('[role="status"]')).toHaveTextContent('new@bezirksamt.berlin.de');
  });

  it('lets a platform admin activate a node', async () => {
    serve('platform_admin', BEC);
    renderConsole(<TenantsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Spandau/ }));
    expect(await screen.findByLabelText(de['console.tenants.status'])).toHaveValue('pilot');
    const role = await screen.findByLabelText(de['console.staff.role']);
    expect(within(role).getAllByRole('option')).toHaveLength(4);
  });

  it("follows the API's canAdmin and canActivate flags over the grants", async () => {
    mockFetch(({ path }) => {
      if (path === '/api/staff/session') return { body: { signedIn: true, me: me('tenant_admin', NK) } };
      if (path === '/api/staff/tenants') return { body: { tenants: [{ ...TENANTS[1], canAdmin: false, canActivate: true }] } };
      if (path.endsWith('/contacts')) return { body: { contacts: [] } };
      if (path.endsWith('/staff')) return { body: { staff: [] } };
      return undefined;
    });
    renderConsole(<TenantsPage />);
    expect(await screen.findByLabelText(de['console.tenants.status'])).toBeInTheDocument();
    expect(screen.getByText(de['console.tenants.readOnly'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: de['console.tenants.saveSettings'] })).not.toBeInTheDocument();
  });

  it('shows a case worker the tree read-only', async () => {
    serve('case_worker', NK);
    renderConsole(<TenantsPage />);
    expect(await screen.findByText(de['console.tenants.readOnly'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: de['console.tenants.saveSettings'] })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: de['console.contacts.add'] })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: de['console.staff.invite'] })).not.toBeInTheDocument();
    expect(await screen.findByText('Verkehrslenkung Berlin')).toBeInTheDocument();
  });
});

describe('forward link page (US-45)', () => {
  const TOKEN = 'fwd_0123456789abcdefghij';

  it('shows the report without login, score or level', async () => {
    mockFetch(({ path }) =>
      path === `/api/forwarded/${TOKEN}`
        ? {
            body: {
              publicId: 'BE-SP-2026-0229',
              category: 'pothole',
              status: 'forwarded',
              description: 'Deep hole in the bike lane.',
              lat: 52.53,
              lon: 13.2,
              createdAt: '2026-11-10T08:00:00Z',
              tenantName: 'Spandau',
              office: 'Bezirksamt Spandau',
              photos: [{ url: 'https://photos.test/blurred.jpg' }],
              publicNote: 'Passed to the VLB.',
              score: 61.2,
              level: 'Critical',
            },
          }
        : undefined,
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <I18nProvider locale="de">
          <ForwardedView token={TOKEN} />
        </I18nProvider>
      </QueryClientProvider>,
    );
    const article = await screen.findByRole('article');
    expect(within(article).getByRole('heading', { level: 1, name: 'Schlagloch' })).toBeInTheDocument();
    expect(article).toHaveTextContent('Passed to the VLB.');
    expect(article).toHaveTextContent('Bezirksamt Spandau (Spandau)');
    expect(article.textContent).not.toMatch(/61|Critical|Kritisch|Score/);
  });

  it('says "This link has expired" for 410 link_expired', async () => {
    mockFetch(({ path }) => (path === `/api/forwarded/${TOKEN}` ? { status: 410, body: { error: 'link_expired' } } : undefined));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <I18nProvider locale="en">
          <ForwardedView token={TOKEN} />
        </I18nProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'This link has expired' })).toBeInTheDocument();
  });
});

describe('citizen report detail: the office note (US-28)', () => {
  it('shows publicNote as the office note, still without score or level', async () => {
    nav.pathname = '/berlin/neukoelln/be-nk-2026-0112';
    mockFetch(({ path }) => {
      if (path === '/api/session') return { body: { signedIn: false } };
      if (path === `/api/public/reports/${ID}`)
        return {
          body: {
            publicId: ID,
            category: 'traffic_light',
            status: 'acknowledged',
            description: 'Dark since this morning.',
            dangerous: true,
            lat: 52.4811,
            lon: 13.4353,
            createdAt: '2026-11-11T08:00:00Z',
            updatedAt: '2026-11-11T09:00:00Z',
            meTooCount: 20,
            tenantName: 'Neukölln',
            office: 'Bezirksamt Neukölln',
            photos: [],
            publicNote: 'Thanks. The fault has been passed to the team responsible for traffic signals.',
          },
        };
      if (path === `/api/public/reports/${ID}/comments`) return { body: { comments: [] } };
      return undefined;
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <I18nProvider locale="de">
          <AuthProvider>
            <ReportDetailView publicId={ID} />
          </AuthProvider>
        </I18nProvider>
      </QueryClientProvider>,
    );
    const note = await screen.findByRole('region', { name: 'Hinweis von Bezirksamt Neukölln' });
    expect(note).toHaveTextContent('passed to the team responsible for traffic signals');
    expect(screen.getByRole('article').textContent).not.toMatch(/Score|Kritisch|Priorit/);
  });
});
