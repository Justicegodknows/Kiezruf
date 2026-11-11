// Component tests for the citizen web and the municipal console, named after the prototype screens.
// The citizen web tests are real; the console ones stay placeholders until the console is built (Phase 2).
import { CATEGORIES } from '@kiezruf/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportCard } from '@/components/ReportCard';
import { MeTooButton } from '@/components/MeTooButton';
import { I18nProvider } from '@/i18n/I18nProvider';
import de from '@/i18n/de.json';
import en from '@/i18n/en.json';
import { API_ERROR_CODES, CLIENT_ERROR_CODES } from '@/lib/errors';
import type { PublicReport } from '@/lib/api-client';
import { ALL_STATUSES } from '@/lib/paths';
import { mockFetch, mockGeolocation, renderWithProviders } from './helpers';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('console: score breakdown panel (US-22, US-24)', () => {
  it.todo('shows co-reporters × 5, commenters × 2 and Me too × 1');
  it.todo('shows decay, danger and safety multipliers, and their product equals the shown score');
  it.todo('shows discounted votes when a spike was handled (US-26)');
});

describe('console: level chip (US-23)', () => {
  it.todo('renders Critical, High, Medium and Low with text, not colour alone (BITV)');
  it.todo('marks a manual override and shows its reason (US-27)');
});

describe('console: scope breadcrumb (US-42, US-43)', () => {
  it.todo('disables levels above the role scope');
  it.todo('offers only live or pilot tenants below the current level');
});

describe('console: forward form (US-45)', () => {
  it.todo('lists parent tenants, live sibling tenants and saved external contacts');
  it.todo('requires a public note when forwarding');
});

describe('console: override form (US-27)', () => {
  it.todo('blocks saving an override without a reason');
});

const REPORT: PublicReport = {
  publicId: 'BE-NK-2026-0112',
  category: 'traffic_light',
  status: 'acknowledged',
  description: 'The pedestrian signal has been dark since this morning.',
  dangerous: true,
  lat: 52.4811,
  lon: 13.4353,
  createdAt: '2026-11-11T08:00:00Z',
  updatedAt: '2026-11-11T09:00:00Z',
  meTooCount: 20,
  tenantName: 'Neukölln',
  office: 'Straßen- und Grünflächenamt',
  distanceM: 80,
};

describe('citizen web: report card (US-15, US-24)', () => {
  it('shows status and Me too count, and never a score or level', () => {
    // A report object that (wrongly) carried score fields must still not show them.
    const leaky = { ...REPORT, score: 61.2, level: 'Critical', priority: 'High' } as PublicReport;
    render(
      <I18nProvider locale="de">
        <ReportCard report={leaky} />
      </I18nProvider>,
    );
    const card = screen.getByRole('article');
    expect(within(card).getByText(de['status.acknowledged'])).toBeInTheDocument();
    expect(within(card).getByText('20 Stimmen')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /Ampel/ })).toHaveAttribute('href', '/berlin/neukoelln/be-nk-2026-0112');
    expect(card.textContent).not.toMatch(/61|Critical|High|Kritisch|Hoch|Score|Priorit/i);
  });

  it.todo('shows co-reporters once the public API returns their count (not in GET /public/reports yet)');
});

describe('citizen web: Me too button (US-18)', () => {
  it('opens sign-in for a guest and completes the vote after sign-in (US-01)', async () => {
    let signedIn = false;
    const calls = mockFetch(({ method, path }) => {
      if (path === '/api/session') return { body: signedIn ? { signedIn: true, email: 'a@example.org' } : { signedIn: false } };
      if (method === 'POST' && path === '/api/auth/code') return { status: 202, body: { sent: true } };
      if (method === 'POST' && path === '/api/auth/verify') {
        signedIn = true;
        return { body: { signedIn: true, newAccount: false } };
      }
      if (method === 'PUT' && path === '/api/reports/BE-NK-2026-0112/me-too') return { body: { voted: true, meTooCount: 21 } };
      return undefined;
    });
    mockGeolocation({ lat: 52.4811, lon: 13.4353, accuracy: 12 });
    const onChange = vi.fn();
    renderWithProviders(<MeTooButton publicId="BE-NK-2026-0112" count={20} voted={false} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Ich auch/ }));

    const dialog = await screen.findByRole('dialog', { name: de['signin.title'] });
    fireEvent.change(within(dialog).getByLabelText(de['signin.email']), { target: { value: 'a@example.org' } });
    fireEvent.click(within(dialog).getByRole('button', { name: de['signin.sendCode'] }));
    fireEvent.change(await within(dialog).findByLabelText(de['signin.code']), { target: { value: '123456' } });
    fireEvent.click(within(dialog).getByRole('button', { name: de['signin.verify'] }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ voted: true, meTooCount: 21 }));
    const vote = calls.find((c) => c.method === 'PUT');
    expect(vote?.body).toEqual({ lat: 52.4811, lon: 13.4353, accuracyM: 12 });
    // The code request asks for German mail, the language of the page.
    expect(calls.find((c) => c.path === '/api/auth/code')?.body).toEqual({ email: 'a@example.org', locale: 'de' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('toggles off on a second tap', async () => {
    const calls = mockFetch(({ method, path }) => {
      if (path === '/api/session') return { body: { signedIn: true } };
      if (method === 'PUT') return { body: { voted: true, meTooCount: 21 } };
      if (method === 'DELETE') return { body: { voted: false, meTooCount: 20 } };
      return undefined;
    });
    mockGeolocation({ lat: 52.4811, lon: 13.4353, accuracy: 12 });
    const onChange = vi.fn();
    function Harness() {
      const [vote, setVote] = useState({ voted: false, meTooCount: 20 });
      return (
        <MeTooButton
          publicId="BE-NK-2026-0112"
          count={vote.meTooCount}
          voted={vote.voted}
          onChange={(next) => {
            onChange(next);
            setVote(next);
          }}
        />
      );
    }
    renderWithProviders(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: /Ich auch/ }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ voted: true, meTooCount: 21 }));

    const pressed = await screen.findByRole('button', { pressed: true });
    expect(pressed).toHaveTextContent(de['meToo.voted']);
    fireEvent.click(pressed);
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ voted: false, meTooCount: 20 }));
    expect(calls.filter((c) => c.path.endsWith('/me-too')).map((c) => c.method)).toEqual(['PUT', 'DELETE']);
  });

  it('shows the not-on-site message the API answers with', async () => {
    mockFetch(({ method, path }) => {
      if (path === '/api/session') return { body: { signedIn: true } };
      if (method === 'PUT') return { status: 422, body: { error: 'not_on_site' } };
      return undefined;
    });
    mockGeolocation({ lat: 52.5, lon: 13.4, accuracy: 12 });
    renderWithProviders(<MeTooButton publicId="BE-NK-2026-0112" count={20} voted={false} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Ich auch/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(de['error.not_on_site']);
  });

  it('asks to wait or step outside when the browser location is too coarse, without calling the API', async () => {
    const calls = mockFetch(({ path }) => (path === '/api/session' ? { body: { signedIn: true } } : undefined));
    mockGeolocation({ lat: 52.5, lon: 13.4, accuracy: 250 });
    renderWithProviders(<MeTooButton publicId="BE-NK-2026-0112" count={20} voted={false} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Ich auch/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(de['error.accuracy_too_low']);
    expect(calls.some((c) => c.path.includes('me-too'))).toBe(false);
  });
});

describe('i18n (US-35)', () => {
  it('every citizen string has a German and an English entry', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
    for (const [key, value] of Object.entries({ ...de, ...en })) expect(value.trim(), key).not.toBe('');
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(de) as (keyof typeof de)[]) expect(placeholders(en[key]), key).toEqual(placeholders(de[key]));
  });

  it('has names for every category, group, status and error code', () => {
    const keys = new Set(Object.keys(de));
    for (const c of CATEGORIES) expect(keys.has(`category.${c.key}`), c.key).toBe(true);
    for (const g of ['traffic', 'community']) expect(keys.has(`group.${g}`), g).toBe(true);
    for (const s of ALL_STATUSES) expect(keys.has(`status.${s}`), s).toBe(true);
    for (const code of [...API_ERROR_CODES, ...CLIENT_ERROR_CODES]) expect(keys.has(`error.${code}`), code).toBe(true);
  });

  it.todo('every console string has a German and an English entry (Phase 2)');
});
