// Console analysis pages (Phase 3) against a mocked BFF: the weekly briefing and its rating (US-53, US-54), the
// hotspot table (US-50, US-52), trends with the change display and export (US-51, US-55), merge suggestions
// (US-17), held-report reasons, and the Monday email switch (US-56).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trendChange } from '@/console/analysis';
import { isCurrentNav } from '@/console/ConsoleShell';
import { BriefingEmailSwitch } from '@/console/components/AccountMenu';
import { BriefingPage } from '@/console/pages/BriefingPage';
import { HotspotsPage } from '@/console/pages/HotspotsPage';
import { ModerationPage } from '@/console/pages/ModerationPage';
import { ReportPage } from '@/console/pages/ReportPage';
import { TrendsPage } from '@/console/pages/TrendsPage';
import { RequireStaff, StaffProvider } from '@/console/StaffProvider';
import type { StaffRole } from '@/console/types';
import { I18nProvider } from '@/i18n/I18nProvider';
import de from '@/i18n/de.json';
import { mockFetch } from './helpers';

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), search: '', pathname: '/console' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => nav.pathname,
  useParams: () => ({}),
}));
vi.mock('maplibre-gl', () => ({
  Map: class {
    constructor() {
      throw new Error('no WebGL in jsdom');
    }
  },
  Marker: class {},
  LngLatBounds: class {},
  NavigationControl: class {},
}));

const NK = { id: '11111111-1111-4111-8111-111111111111', name: 'Neukölln', path: 'de.be.bec.nk' };
const SP = { id: '22222222-2222-4222-8222-222222222222', name: 'Spandau', path: 'de.be.bec.sp' };
const BEC = { id: '33333333-3333-4333-8333-333333333333', name: 'Berlin (Stadt)', path: 'de.be.bec' };
const TENANTS = [
  { ...BEC, parentId: null, type: 'kreisfreie_stadt', status: 'grouping' },
  { ...NK, parentId: BEC.id, type: 'bezirk', status: 'pilot' },
  { ...SP, parentId: BEC.id, type: 'bezirk', status: 'pilot' },
];
const ITEM_1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const ITEM_2 = 'aaaaaaaa-0000-4000-8000-000000000002';

function me(role: StaffRole, tenant: { id: string; name: string; path: string }, preferences?: unknown) {
  return { id: 'acc-me', email: 'me@bezirksamt.berlin.de', grants: [{ tenantId: tenant.id, tenantName: tenant.name, path: tenant.path, role }], ...(preferences ? { preferences } : {}) };
}

function renderConsole(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider locale="de">
        <StaffProvider>
          <RequireStaff>{ui}</RequireStaff>
        </StaffProvider>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  nav.replace.mockReset();
  nav.search = '';
  nav.pathname = '/console';
  window.history.replaceState(null, '', '/console');
});

afterEach(() => vi.unstubAllGlobals());

const BRIEFINGS = {
  briefings: [
    {
      id: 'b-45',
      tenant: NK,
      weekStart: '2026-11-09',
      generatedAt: '2026-11-09T05:00:00Z',
      aiWritten: true,
      fallback: false,
      items: [
        {
          id: ITEM_1,
          level: 'Critical',
          kind: 'Urgent',
          headline: 'Dark pedestrian signal at Karl-Marx-Straße',
          text: 'Four neighbours and 20 Me too since Monday.',
          citations: ['BE-NK-2026-0112', 'BE-NK-2026-0118'],
          myRating: null,
        },
        { id: ITEM_2, level: 'Low', kind: 'Improving', headline: 'Fewer dumping reports', text: 'Down by a third.', citations: ['BE-NK-2026-0090'], myRating: { useful: true, note: null } },
      ],
    },
    {
      id: 'b-44',
      tenant: NK,
      weekStart: '2026-11-02',
      generatedAt: '2026-11-02T06:00:00Z',
      aiWritten: false,
      fallback: true,
      items: [{ id: 'aaaaaaaa-0000-4000-8000-000000000003', level: 'High', kind: 'Urgent', headline: 'BE-NK-2026-0101', text: 'pothole', citations: ['BE-NK-2026-0101'], myRating: null }],
    },
  ],
};

describe('weekly briefing (US-53, US-54)', () => {
  function serve(role: StaffRole = 'case_worker', grantAt = NK) {
    return mockFetch(({ method, path }) => {
      if (path === '/api/staff/session') return { body: { signedIn: true, me: me(role, grantAt) } };
      if (path === '/api/staff/tenants') return { body: { tenants: TENANTS } };
      if (path.startsWith('/api/staff/briefings?')) return { body: BRIEFINGS };
      if (method === 'POST' && path === `/api/staff/briefings/items/${ITEM_1}/rating`) return { status: 204 };
      return undefined;
    });
  }

  it('shows the latest briefing for the tenant: AI label, levels, kinds and cited report links', async () => {
    const calls = serve();
    renderConsole(<BriefingPage />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Wochenbriefing · Neukölln' })).toBeInTheDocument();
    expect(await screen.findByTestId('briefing-label')).toHaveTextContent(de['console.briefing.aiLabel']);
    expect(calls.find((c) => c.path.startsWith('/api/staff/briefings'))?.path).toBe(`/api/staff/briefings?tenantId=${NK.id}`);
    const urgent = screen.getByRole('article', { name: 'Dark pedestrian signal at Karl-Marx-Straße' });
    expect(urgent).toHaveTextContent(de['level.Critical']);
    expect(urgent).toHaveTextContent(de['console.briefing.kind.Urgent']);
    expect(within(urgent).getByRole('link', { name: 'BE-NK-2026-0112' })).toHaveAttribute('href', '/console/reports/BE-NK-2026-0112');
    expect(within(urgent).getByRole('link', { name: 'BE-NK-2026-0118' })).toBeInTheDocument();
    // The caller's earlier rating is shown and pressed.
    const improving = screen.getByRole('article', { name: 'Fewer dumping reports' });
    expect(improving).toHaveTextContent('Ihre Bewertung: Nützlich');
    expect(within(improving).getByRole('button', { name: de['console.briefing.useful'] })).toHaveAttribute('aria-pressed', 'true');
    // Week picker lists both weeks; a roll-up tenant picker offers what the grant covers.
    expect(screen.getByLabelText(de['console.briefing.weekLabel'])).toHaveTextContent('KW 45');
  });

  it('rates an item "Something is wrong" with a note', async () => {
    const calls = serve();
    renderConsole(<BriefingPage />);
    const urgent = await screen.findByRole('article', { name: 'Dark pedestrian signal at Karl-Marx-Straße' });
    fireEvent.click(within(urgent).getByRole('button', { name: de['console.briefing.wrong'] }));
    fireEvent.change(within(urgent).getByLabelText(de['console.briefing.note']), { target: { value: '  0118 is in Spandau  ' } });
    fireEvent.click(within(urgent).getByRole('button', { name: de['console.briefing.sendRating'] }));
    expect(await within(urgent).findByRole('status')).toHaveTextContent(de['console.briefing.ratingSaved']);
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({ path: `/api/staff/briefings/items/${ITEM_1}/rating`, body: { useful: false, note: '0118 is in Spandau' } });
  });

  it('marks an older fallback week as not AI-written and names the category', async () => {
    serve();
    renderConsole(<BriefingPage />);
    fireEvent.change(await screen.findByLabelText(de['console.briefing.weekLabel']), { target: { value: 'b-44' } });
    expect(await screen.findByTestId('briefing-label')).toHaveTextContent(de['console.briefing.fallbackLabel']);
    expect(screen.queryByText(de['console.briefing.aiLabel'])).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'BE-NK-2026-0101' })).toHaveTextContent(de['category.pothole']);
  });

  it('offers roll-up nodes in the tenant picker and puts the choice in the URL', async () => {
    serve('viewer', BEC);
    renderConsole(<BriefingPage />);
    const picker = await screen.findByLabelText(de['console.analysis.tenant']);
    expect(within(picker).getAllByRole('option').map((o) => o.textContent?.trim())).toEqual(['Berlin (Stadt)', 'Neukölln', 'Spandau']);
    fireEvent.change(picker, { target: { value: SP.id } });
    expect(nav.replace).toHaveBeenLastCalledWith(`/console?tenantId=${SP.id}`, { scroll: false });
  });

  it('says when a level has no briefing yet', async () => {
    mockFetch(({ path }) => {
      if (path === '/api/staff/session') return { body: { signedIn: true, me: me('case_worker', NK) } };
      if (path === '/api/staff/tenants') return { body: { tenants: TENANTS } };
      if (path.startsWith('/api/staff/briefings')) return { body: { briefings: [] } };
      return undefined;
    });
    renderConsole(<BriefingPage />);
    expect(await screen.findByText(de['console.briefing.none'])).toBeInTheDocument();
  });
});

describe('hotspots (US-50, US-52)', () => {
  it('lists the clusters in a table: level as text, group, count, recurring with weekday, report links', async () => {
    const calls = mockFetch(({ path }) => {
      if (path === '/api/staff/session') return { body: { signedIn: true, me: me('case_worker', NK) } };
      if (path === '/api/staff/tenants') return { body: { tenants: TENANTS } };
      if (path.startsWith('/api/staff/hotspots')) {
        return {
          body: {
            computedAt: '2026-11-12T02:00:00Z',
            clusters: [
              { id: 'c2', group: 'community', lat: 52.47, lon: 13.44, count: 2, level: 'Medium', publicIds: ['BE-NK-2026-0101', 'BE-NK-2026-0102'], recurring: false, weekdayPattern: null },
              { id: 'c1', group: 'traffic', lat: 52.48, lon: 13.43, count: 5, level: 'Critical', publicIds: ['BE-NK-2026-0112', 'BE-NK-2026-0113'], recurring: true, weekdayPattern: 'mon' },
            ],
          },
        };
      }
      return undefined;
    });
    renderConsole(<HotspotsPage />);
    const table = await screen.findByRole('table');
    expect(calls.find((c) => c.path.startsWith('/api/staff/hotspots'))?.path).toBe(`/api/staff/hotspots?tenantId=${NK.id}`);
    const rows = within(table).getAllByRole('row').slice(1);
    // Highest level first.
    expect(rows[0]).toHaveTextContent(de['level.Critical']);
    expect(rows[0]).toHaveTextContent(de['group.traffic']);
    expect(rows[0]).toHaveTextContent('5');
    expect(rows[0]).toHaveTextContent(de['console.hotspots.isRecurring']);
    expect(rows[0]).toHaveTextContent('meist montags');
    expect(within(rows[0]!).getByRole('link', { name: 'BE-NK-2026-0112' })).toHaveAttribute('href', '/console/reports/BE-NK-2026-0112');
    expect(rows[1]).toHaveTextContent(de['level.Medium']);
    expect(rows[1]).toHaveTextContent(de['group.community']);
    expect(rows[1]).not.toHaveTextContent('meist');
    // The map failed in jsdom; the table is the full alternative.
    expect(screen.getByText(de['console.hotspots.mapFailed'])).toBeInTheDocument();
  });
});

describe('trends and export (US-51, US-55)', () => {
  it('computes the change against the 4 weeks before the latest', () => {
    expect(trendChange({ counts: [1, 1, 1, 4, 4, 4, 4, 6], fourWeekAverage: null, change: null })).toMatchObject({ direction: 'up', percent: 50, latest: 6, average: 4 });
    expect(trendChange({ counts: [0, 0, 0, 4, 4, 4, 4, 3], fourWeekAverage: 4, change: 0.9 })).toMatchObject({ direction: 'down', percent: -25 });
    expect(trendChange({ counts: [0, 0, 0, 0, 0, 0, 0, 2], fourWeekAverage: 0, change: null })).toMatchObject({ direction: 'new', percent: null });
    expect(trendChange({ counts: [], fourWeekAverage: null, change: 0.1 })).toMatchObject({ direction: 'up', percent: 10 });
    expect(trendChange({ counts: [], fourWeekAverage: null, change: null })).toMatchObject({ direction: 'none' });
  });

  it('shows weekly counts, the change as text with its sign, the medians and the CSV links for the tenant', async () => {
    const calls = mockFetch(({ path }) => {
      if (path === '/api/staff/session') return { body: { signedIn: true, me: me('case_worker', NK) } };
      if (path === '/api/staff/tenants') return { body: { tenants: TENANTS } };
      if (path.startsWith('/api/staff/trends')) {
        return {
          body: {
            weeks: ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'],
            categories: [
              { category: 'pothole', counts: [1, 2, 1, 4, 4, 4, 4, 6], fourWeekAverage: 4, change: 0.5 },
              { category: 'illegal_dumping', counts: [3, 3, 3, 4, 4, 4, 4, 3], fourWeekAverage: 4, change: -0.25 },
              { category: 'playground', counts: [0, 0, 0, 0, 0, 0, 0, 2], fourWeekAverage: 0, change: null },
              { category: 'bike_lane', counts: [1, 1, 1, 2, 2, 2, 2, 2], fourWeekAverage: 2, change: 0 },
            ],
            medianHoursToAcknowledge: 38.4,
            medianHoursToResolve: 81.6,
          },
        };
      }
      return undefined;
    });
    renderConsole(<TrendsPage />);
    expect(await screen.findByTestId('change-pothole')).toHaveTextContent('+50 %');
    expect(calls.find((c) => c.path.startsWith('/api/staff/trends'))?.path).toBe(`/api/staff/trends?weeks=8&tenantId=${NK.id}`);
    expect(screen.getByTestId('change-illegal_dumping')).toHaveTextContent('−25 %');
    expect(screen.getByTestId('change-playground')).toHaveTextContent(de['console.trends.changeNew']);
    expect(screen.getByTestId('change-bike_lane')).toHaveTextContent('±0 %');
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'KW 45' })).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /Schlagloch/ })).toHaveTextContent('1214444');
    expect(screen.getByText('38 Std.')).toBeInTheDocument();
    expect(screen.getByText('3,4 Tage')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: de['console.export.trendsButton'] })).toHaveAttribute('href', `/api/staff/export/trends.csv?tenantId=${NK.id}`);
    fireEvent.change(screen.getByLabelText(de['console.export.from']), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText(de['console.export.to']), { target: { value: '2026-11-12' } });
    expect(screen.getByRole('link', { name: de['console.export.queueButton'] })).toHaveAttribute(
      'href',
      `/api/staff/export/queue.csv?tenantId=${NK.id}&from=2026-10-01&to=2026-11-12`,
    );
    fireEvent.change(screen.getByLabelText(de['console.export.from']), { target: { value: '2026-12-01' } });
    expect(screen.getByRole('alert')).toHaveTextContent(de['console.export.badRange']);
    expect(screen.getByRole('button', { name: de['console.export.queueButton'] })).toBeDisabled();
  });
});

describe('merge suggestions on the report detail (US-17)', () => {
  const ID = 'BE-NK-2026-0112';
  const DUP = 'BE-NK-2026-0118';
  function serve(role: StaffRole, editable: boolean) {
    return mockFetch(({ method, path }) => {
      if (path === '/api/staff/session') return { body: { signedIn: true, me: me(role, NK) } };
      if (path === `/api/staff/reports/${ID}`) {
        return { body: { publicId: ID, category: 'traffic_light', status: 'open', score: 40, level: 'High', tenant: NK, editable, counts: {}, photos: [], comments: [], history: [] } };
      }
      if (path === `/api/staff/reports/${ID}/duplicates`) {
        return { body: { matches: [{ publicId: DUP, status: 'open', level: 'Medium', distanceM: 40, similarity: 0.87, createdAt: '2026-11-11T09:00:00Z' }] } };
      }
      if (path === '/api/staff/tenants') return { body: { tenants: TENANTS } };
      if (path.startsWith('/api/staff/reports?')) return { body: { reports: [] } };
      if (method === 'POST' && path === `/api/staff/reports/${DUP}/merge`) return { body: { mergedInto: ID } };
      return undefined;
    });
  }

  it('lists the matches and merges one into this report after confirming', async () => {
    const calls = serve('case_worker', true);
    renderConsole(<ReportPage publicId={ID} />);
    const section = (await screen.findByRole('heading', { name: de['console.suggest.title'] })).closest('section')!;
    expect(await within(section).findByRole('link', { name: DUP })).toHaveAttribute('href', `/console/reports/${DUP}`);
    expect(section).toHaveTextContent('40 m entfernt');
    expect(section).toHaveTextContent('Foto 87 % ähnlich');
    fireEvent.click(within(section).getByRole('button', { name: new RegExp(de['console.suggest.mergeHere']) }));
    fireEvent.click(await screen.findByRole('button', { name: de['console.merge.confirm'] }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')).toMatchObject({ path: `/api/staff/reports/${DUP}/merge`, body: { into: ID } }));
    expect(await within(section).findByRole('status')).toHaveTextContent(`${DUP} wurde in ${ID} zusammengeführt.`);
  });

  it('offers no merge to a viewer', async () => {
    serve('viewer', true);
    renderConsole(<ReportPage publicId={ID} />);
    expect(await screen.findByRole('link', { name: DUP })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: new RegExp(de['console.suggest.mergeHere']) })).not.toBeInTheDocument();
    expect(screen.getByText(de['console.suggest.readOnly'])).toBeInTheDocument();
  });
});

describe('moderation: why a report is held', () => {
  it('shows blur_failed and too_large as text', async () => {
    mockFetch(({ path }) => {
      if (path === '/api/staff/session') return { body: { signedIn: true, me: me('case_worker', NK) } };
      if (path === '/api/staff/moderation') {
        return {
          body: {
            comments: [],
            spikes: [],
            held: [
              { publicId: 'BE-NK-2026-0120', tenantName: 'Neukölln', reason: 'blur_failed' },
              { publicId: 'BE-NK-2026-0121', tenantName: 'Neukölln', reason: 'too_large' },
            ],
          },
        };
      }
      return undefined;
    });
    renderConsole(<ModerationPage />);
    expect(await screen.findByText(de['console.moderation.heldReason.blur_failed'])).toBeInTheDocument();
    expect(screen.getByText(de['console.moderation.heldReason.too_large'])).toBeInTheDocument();
  });
});

describe('Monday briefing email (US-56)', () => {
  it('lets a tenant admin turn the email off', async () => {
    const calls = mockFetch(({ method, path }) => {
      if (path === '/api/staff/session') return { body: { signedIn: true, me: me('tenant_admin', NK, { briefingEmail: true }) } };
      if (method === 'PUT' && path === '/api/staff/me/preferences') return { status: 204 };
      return undefined;
    });
    renderConsole(<BriefingEmailSwitch />);
    const toggle = await screen.findByRole('switch', { name: de['console.account.briefingEmail'] });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(await screen.findByRole('status')).toHaveTextContent(de['console.account.emailOff']);
    expect(calls.find((c) => c.method === 'PUT')).toMatchObject({ body: { briefingEmail: false } });
    expect(screen.getByRole('switch', { name: de['console.account.briefingEmail'] })).not.toBeChecked();
  });

  it('tells a case worker that the email goes to tenant admins', async () => {
    mockFetch(({ path }) => (path === '/api/staff/session' ? { body: { signedIn: true, me: me('case_worker', NK) } } : undefined));
    renderConsole(<BriefingEmailSwitch />);
    expect(await screen.findByText(de['console.account.emailAdminsOnly'])).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});

describe('console navigation', () => {
  it('opens on the briefing; report pages belong to the queue', () => {
    expect(isCurrentNav('/console', '/console')).toBe(true);
    expect(isCurrentNav('/console', '/console/queue')).toBe(false);
    expect(isCurrentNav('/console/queue', '/console/reports/BE-NK-2026-0112')).toBe(true);
    expect(isCurrentNav('/console/hotspots', '/console/hotspots')).toBe(true);
  });
});
