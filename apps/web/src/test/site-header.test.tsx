// Citizen header: signed out it offers sign-in; signed in it offers sign-out, which ends the session and leaves for `/`.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteHeader } from '@/components/SiteHeader';
import de from '@/i18n/de.json';
import { mockFetch, renderWithProviders } from './helpers';

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/my-reports',
}));

// jsdom has no matchMedia; the header's theme switch reads the OS colour scheme with it.
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  nav.push.mockReset();
});

describe('citizen header', () => {
  it('signs out from the header and goes to the landing page', async () => {
    let signedIn = true;
    const calls = mockFetch(({ method, path }) => {
      if (path === '/api/session') return { body: { signedIn } };
      if (method === 'POST' && path === '/api/auth/logout') {
        signedIn = false;
        return { status: 204 };
      }
      return undefined;
    });
    renderWithProviders(<SiteHeader />);

    fireEvent.click(await screen.findByRole('button', { name: de['account.signOut'] }));

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/'));
    expect(calls.some((c) => c.method === 'POST' && c.path === '/api/auth/logout')).toBe(true);
    expect(await screen.findByRole('button', { name: de['nav.signIn'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: de['account.signOut'] })).not.toBeInTheDocument();
  });

  it('offers sign-in, not sign-out, when signed out', async () => {
    mockFetch(({ path }) => (path === '/api/session' ? { body: { signedIn: false } } : undefined));
    renderWithProviders(<SiteHeader />);
    expect(await screen.findByRole('button', { name: de['nav.signIn'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: de['account.signOut'] })).not.toBeInTheDocument();
  });
});
