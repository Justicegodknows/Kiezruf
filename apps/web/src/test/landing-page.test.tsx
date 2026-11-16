// Landing page at `/` (design from main, PR 2): street-name plates and the device preview show real public reports,
// never score or level (US-24), and the page always leads to the map at /berlin and to posting.
import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatAge, LANDING_REPORTS_PATH, LandingPage, newestOpen } from '@/components/LandingPage';
import de from '@/i18n/de.json';
import type { PublicReport } from '@/lib/api-client';
import { mockFetch, renderWithProviders } from './helpers';

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element -- a stand-in for next/image in jsdom
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));

afterEach(() => vi.unstubAllGlobals());

function report(publicId: string, overrides: Partial<PublicReport> = {}): PublicReport {
  return {
    publicId,
    category: 'pothole',
    status: 'open',
    description: null,
    dangerous: false,
    lat: 52.48,
    lon: 13.43,
    createdAt: '2026-11-16T08:00:00Z',
    updatedAt: '2026-11-16T08:00:00Z',
    meTooCount: 4,
    tenantName: 'Neukölln',
    office: 'Bezirksamt Neukölln',
    ...overrides,
  };
}

describe('landing page', () => {
  it('shows the three newest unresolved reports as plates, newest first, and links them', async () => {
    const reports = [
      report('BE-NK-2026-0001', { createdAt: '2026-11-10T08:00:00Z' }),
      report('BE-NK-2026-0002', { createdAt: '2026-11-16T09:00:00Z', status: 'resolved' }),
      report('BE-NK-2026-0003', { createdAt: '2026-11-15T08:00:00Z' }),
      report('BE-SP-2026-0004', { createdAt: '2026-11-16T07:00:00Z', tenantName: 'Spandau' }),
      report('BE-NK-2026-0005', { createdAt: '2026-11-14T08:00:00Z' }),
    ];
    const calls = mockFetch(({ path }) => {
      if (path === `/api/${LANDING_REPORTS_PATH}`) return { body: { reports } };
      if (path === '/api/public/reports/BE-SP-2026-0004') return { body: { ...reports[3], photos: [], publicNote: 'Wir prüfen das.' } };
      if (path === '/api/session') return { body: { signedIn: false } };
      return undefined;
    });
    renderWithProviders(<LandingPage />);

    await screen.findByText('Spandau');
    const plates = document.querySelectorAll('.plates__list a.plate');
    expect([...plates].map((a) => a.getAttribute('href'))).toEqual([
      '/berlin/spandau/be-sp-2026-0004',
      '/berlin/neukoelln/be-nk-2026-0003',
      '/berlin/neukoelln/be-nk-2026-0005',
    ]);
    expect(within(plates[0] as HTMLElement).getByText('Spandau')).toBeInTheDocument();

    // The device preview is the newest report, with the office's note from the detail answer.
    expect(await screen.findByText('Wir prüfen das.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: de['home.bandLink'] })).toHaveAttribute('href', '/berlin/spandau/be-sp-2026-0004');
    expect(calls.some((c) => c.path === '/api/public/reports/BE-SP-2026-0004')).toBe(true);
    expect(document.body.textContent).not.toMatch(/score|level|Priorität/i);
  });

  it('leads to the map and to posting, and says so when there are no reports', async () => {
    mockFetch(({ path }) => (path === `/api/${LANDING_REPORTS_PATH}` ? { body: { reports: [] } } : undefined));
    renderWithProviders(<LandingPage />);
    expect(await screen.findByText(de['home.platesEmpty'])).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: de['home.title'] })).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: de['home.ctaBrowse'] })) expect(link).toHaveAttribute('href', '/berlin');
    expect(screen.getByRole('link', { name: de['home.ctaReport'] })).toHaveAttribute('href', '/new-report');
    expect(screen.queryByRole('link', { name: de['home.bandLink'] })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: de['home.photoAlt'] })).toBeInTheDocument();
  });

  it('says when the reports cannot be loaded', async () => {
    mockFetch(() => ({ status: 502, body: { error: 'service_unavailable' } }));
    renderWithProviders(<LandingPage />);
    expect(await screen.findByText(de['home.platesError'])).toBeInTheDocument();
  });
});

describe('landing page helpers', () => {
  it('keeps unresolved reports, newest first', () => {
    const picked = newestOpen([report('A', { createdAt: '2026-01-01T00:00:00Z' }), report('B', { createdAt: '2026-02-01T00:00:00Z' })], 1);
    expect(picked.map((r) => r.publicId)).toEqual(['B']);
  });

  it('formats the age in the largest whole unit', () => {
    const now = Date.parse('2026-11-16T12:00:00Z');
    expect(formatAge('en', '2026-11-16T11:59:30Z', now)).toBeNull();
    expect(formatAge('en', '2026-11-16T11:15:00Z', now)).toBe('45 minutes ago');
    expect(formatAge('en', '2026-11-16T09:00:00Z', now)).toBe('3 hours ago');
    expect(formatAge('de', '2026-11-13T12:00:00Z', now)).toBe('vor 3 Tagen');
    expect(formatAge('de', 'not a date', now)).toBeNull();
  });
});
