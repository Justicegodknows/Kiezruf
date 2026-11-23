// The feed (landing page) and the first-visit splash lead staff to the console's sign-in (/console).
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowseShell } from '@/components/BrowseShell';
import de from '@/i18n/de.json';
import { mockFetch, renderWithProviders } from './helpers';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/',
}));
// jsdom has no WebGL; the map fails quietly and the list stays.
vi.mock('maplibre-gl', () => ({
  Map: class {
    constructor() {
      throw new Error('no WebGL in jsdom');
    }
  },
  Marker: class {},
}));

beforeEach(() => {
  mockFetch(({ path }) => {
    if (path === '/api/session') return { body: { signedIn: false } };
    if (path.startsWith('/api/public/reports?')) return { body: { reports: [] } };
    return undefined;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('landing page: the way to the staff console', () => {
  it('shows "Verwaltung" in the feed’s top bar, linking to the console sign-in', async () => {
    window.localStorage.setItem('kz-onboarded', '1');
    renderWithProviders(<BrowseShell>{null}</BrowseShell>);
    const link = await screen.findByRole('link', { name: de['kz.consoleLong'] });
    expect(link).toHaveAttribute('href', '/console');
    expect(link).toHaveTextContent(de['kz.console']);
  });

  it('offers the console on the first-visit splash too', async () => {
    renderWithProviders(<BrowseShell>{null}</BrowseShell>);
    expect(await screen.findByRole('dialog', { name: 'Kiezruf' })).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: de['kz.consoleLong'] });
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/console', '/console']);
  });
});

// User testing 2026-11-23 (participant 1): no email before any content, no topic filter before the feed.
describe('first visit: content before an account', () => {
  it('says what Kiezruf is and opens the feed without asking for an email or topics', async () => {
    renderWithProviders(<BrowseShell>{null}</BrowseShell>);
    const splash = await screen.findByRole('dialog', { name: 'Kiezruf' });
    expect(splash).toHaveTextContent(de['kz.whatItIs']);
    expect(splash).toHaveTextContent(de['kz.noAccountYet']);
    expect(screen.queryByLabelText(/E-Mail/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: de['kz.start'] }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('kz-onboarded')).toBe('1');
    expect(screen.getByRole('link', { name: de['kz.navNew'] })).toBeInTheDocument();
  });
});
