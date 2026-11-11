// Component tests for the citizen web and the municipal console, named after the prototype screens.
// Console pages with data and permissions are tested in console-pages.test.tsx.
import { CATEGORIES, priorityScore, type ScoreInput } from '@kiezruf/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForwardForm, MergeForm, OverrideForm, StatusForm } from '@/console/components/ActionForms';
import { LevelChip } from '@/console/components/LevelChip';
import { ScopeBreadcrumb } from '@/console/components/ScopeBreadcrumb';
import { ScoreBreakdown } from '@/console/components/ScoreBreakdown';
import { formatScore, parseLocaleNumber } from '@/console/format';
import { forwardTargetsFrom } from '@/console/tenants';
import { LEVELS, STAFF_ROLES, TENANT_STATUSES, type Breakdown, type StaffMe, type StaffTenant } from '@/console/types';
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

// --- Console fixtures ---------------------------------------------------------------------------------------

/** The prototype's BE-NK-2026-0112: 4 co-reporters, 5 commenters, 20 Me too, 2 h old, 3 danger marks, safety. */
const INPUT: ScoreInput = { coReporters: 4, commenters: 5, meToo: 20, ageHours: 2, dangerMarks: 3, safetyCategory: true };
const BREAKDOWN: Breakdown = {
  coReporters: INPUT.coReporters,
  commenters: INPUT.commenters,
  meToo: INPUT.meToo,
  discountedVotes: null,
  base: 50,
  ageHours: INPUT.ageHours,
  decay: Math.pow(0.5, INPUT.ageHours / (24 * 14)),
  dangerMarks: 3,
  dangerMultiplier: 1.5,
  safetyCategory: true,
  safetyMultiplier: 1.3,
  score: priorityScore(INPUT),
};

function tenant(id: string, name: string, path: string, status: StaffTenant['status'], type = 'bezirk', parentId: string | null = null): StaffTenant {
  return { id, name, path, status, type, parentId, office: null, thresholds: null, canAdmin: null, canActivate: null };
}
const DE_ROOT = tenant('t-de', 'Deutschland', 'de', 'grouping', 'country');
const BE = tenant('t-be', 'Berlin', 'de.be', 'grouping', 'land', 't-de');
const BEC = tenant('t-bec', 'Berlin (Stadt)', 'de.be.bec', 'grouping', 'kreisfreie_stadt', 't-be');
const NK = tenant('t-nk', 'Neukölln', 'de.be.bec.nk', 'pilot', 'bezirk', 't-bec');
const SP = tenant('t-sp', 'Spandau', 'de.be.bec.sp', 'pilot', 'bezirk', 't-bec');
const MI = tenant('t-mi', 'Mitte', 'de.be.bec.mi', 'not_live', 'bezirk', 't-bec');
const TREE = [DE_ROOT, BE, BEC, NK, SP, MI];
const meWith = (role: StaffMe['grants'][number]['role'], t: StaffTenant): StaffMe => ({
  id: 'acc-1',
  email: 'staff@example.org',
  grants: [{ tenantId: t.id, tenantName: t.name, path: t.path, role }],
});

const ok = async () => ({ ok: true as const, status: 200, data: {} });

/** The numbers the breakdown shows, read back from the page. */
function shown(container: HTMLElement, factor: string): number {
  const el = container.querySelector(`[data-factor="${factor}"]`);
  return parseLocaleNumber('de', el?.textContent ?? 'NaN');
}

describe('console: score breakdown panel (US-22, US-24)', () => {
  it('shows co-reporters × 5, commenters × 2 and Me too × 1', () => {
    render(
      <I18nProvider locale="de">
        <ScoreBreakdown breakdown={BREAKDOWN} />
      </I18nProvider>,
    );
    const table = screen.getByRole('table');
    const row = (name: string) => within(table).getByRole('row', { name: new RegExp(name) });
    expect(row('Mitmeldende: 4 × 5')).toHaveTextContent('20');
    expect(row('Kommentierende: 5 × 2')).toHaveTextContent('10');
    expect(row('Ich auch: 20 × 1')).toHaveTextContent('20');
    expect(row(de['console.breakdown.base'])).toHaveTextContent('50');
  });

  it('shows decay, danger and safety multipliers, and their product equals the shown score', () => {
    const { container } = render(
      <I18nProvider locale="de">
        <ScoreBreakdown breakdown={BREAKDOWN} />
      </I18nProvider>,
    );
    expect(screen.getByRole('row', { name: /Gefahr \(3 Bestätigungen\)/ })).toHaveTextContent('1,5');
    expect(screen.getByRole('row', { name: new RegExp(de['console.breakdown.safety']) })).toHaveTextContent('1,3');
    expect(screen.getByRole('row', { name: /Aktualität \(Alter 2 Std\./ })).toHaveTextContent('0,99588');
    const product = shown(container, 'base') * shown(container, 'decay') * shown(container, 'danger') * shown(container, 'safety');
    const score = shown(container, 'score');
    expect(score).toBe(97.1);
    expect(formatScore('de', product)).toBe('97,1');
    expect(screen.getByTestId('breakdown-formula')).toHaveTextContent('50 × 0,99588 × 1,5 × 1,3 = 97,1');
  });

  it('keeps product and score in step for many inputs, as shared priorityScore computes them', () => {
    for (const input of [
      { coReporters: 1, commenters: 0, meToo: 0, ageHours: 0, dangerMarks: 0, safetyCategory: false },
      { coReporters: 12, commenters: 31, meToo: 240, ageHours: 400, dangerMarks: 1, safetyCategory: true },
      { coReporters: 3, commenters: 2, meToo: 7.5, ageHours: 1000, dangerMarks: 5, safetyCategory: false },
    ]) {
      const base = input.coReporters * 5 + input.commenters * 2 + input.meToo;
      const decay = Math.pow(0.5, input.ageHours / 336);
      const danger = input.dangerMarks >= 3 ? 1.5 : input.dangerMarks >= 1 ? 1.2 : 1;
      const safety = input.safetyCategory ? 1.3 : 1;
      const { container, unmount } = render(
        <I18nProvider locale="en">
          <ScoreBreakdown breakdown={{ ...BREAKDOWN, ...input, discountedVotes: null, base, decay, dangerMultiplier: danger, safetyMultiplier: safety, score: priorityScore(input) }} />
        </I18nProvider>,
      );
      const read = (f: string) => parseLocaleNumber('en', container.querySelector(`[data-factor="${f}"]`)!.textContent!);
      const product = read('base') * read('decay') * read('danger') * read('safety');
      // "Visibly equal": the product of the shown factors, rounded like the score, is the shown score.
      expect(formatScore('en', product)).toBe(container.querySelector('[data-factor="score"]')!.textContent);
      unmount();
    }
  });

  it('shows discounted votes when a spike was handled (US-26)', () => {
    render(
      <I18nProvider locale="de">
        <ScoreBreakdown breakdown={{ ...BREAKDOWN, meToo: 12.5, discountedVotes: 15, base: 42.5, score: 42.5 * BREAKDOWN.decay * 1.5 * 1.3 }} />
      </I18nProvider>,
    );
    const row = screen.getByRole('row', { name: /Ich auch: 12,5 × 1/ });
    expect(row).toHaveTextContent('davon 15 von neuen Konten zur Hälfte gezählt');
    expect(row).toHaveTextContent('12,5');
  });
});

describe('console: level chip (US-23)', () => {
  it('renders Critical, High, Medium and Low with text, not colour alone (BITV)', () => {
    render(
      <I18nProvider locale="de">
        {LEVELS.map((level) => (
          <LevelChip key={level} level={level} />
        ))}
      </I18nProvider>,
    );
    for (const [level, label] of [
      ['critical', 'Kritisch'],
      ['high', 'Hoch'],
      ['medium', 'Mittel'],
      ['low', 'Niedrig'],
    ]) {
      const chip = screen.getByText(label);
      expect(chip).toHaveClass(`level-${level}`);
      expect(chip.textContent?.trim()).toMatch(new RegExp(`${label}$`));
    }
  });

  it('marks a manual override and shows its reason (US-27)', () => {
    render(
      <I18nProvider locale="de">
        <LevelChip level="Critical" override={{ level: 'Critical', reason: 'School route' }} showReason />
      </I18nProvider>,
    );
    expect(screen.getByText(de['console.override.marker'], { exact: false })).toHaveTextContent(`${de['console.override.marker']}: School route`);
  });
});

describe('console: scope breadcrumb (US-42, US-43)', () => {
  it('disables levels above the role scope', () => {
    const onSelect = vi.fn();
    render(
      <I18nProvider locale="de">
        <ScopeBreadcrumb tenants={TREE} current={NK} me={meWith('case_worker', NK)} onSelect={onSelect} />
      </I18nProvider>,
    );
    const nav = screen.getByRole('navigation', { name: de['console.scope.label'] });
    expect(within(nav).getByRole('button', { name: 'Deutschland' })).toBeDisabled();
    expect(within(nav).getByRole('button', { name: 'Berlin' })).toBeDisabled();
    expect(within(nav).getByRole('button', { name: 'Berlin (Stadt)' })).toBeDisabled();
    const own = within(nav).getByRole('button', { name: 'Neukölln' });
    expect(own).toBeEnabled();
    expect(own).toHaveAttribute('aria-current', 'page');
  });

  it('offers only live or pilot tenants below the current level', () => {
    const onSelect = vi.fn();
    render(
      <I18nProvider locale="de">
        <ScopeBreadcrumb tenants={TREE} current={BEC} me={meWith('viewer', BE)} onSelect={onSelect} />
      </I18nProvider>,
    );
    const below = screen.getByLabelText(de['console.scope.below']);
    const options = within(below).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual([de['console.scope.belowPlaceholder'], 'Neukölln', 'Spandau']);
    fireEvent.change(below, { target: { value: 't-sp' } });
    expect(onSelect).toHaveBeenCalledWith(SP);
    expect(screen.getByRole('button', { name: 'Deutschland' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Berlin' })).toBeEnabled();
  });
});

describe('console: forward form (US-45)', () => {
  const contacts = [{ id: 'c-vlb', name: 'Verkehrslenkung Berlin', email: 'vlb@berlin.de' }];

  it('lists parent tenants, live sibling tenants and saved external contacts', () => {
    const targets = forwardTargetsFrom(TREE, 't-nk', contacts);
    expect(targets.parents.map((t) => t.name)).toEqual(['Berlin']);
    expect(targets.siblings.map((t) => t.name)).toEqual(['Spandau']);
    render(
      <I18nProvider locale="de">
        <ForwardForm targets={targets} submit={ok} />
      </I18nProvider>,
    );
    const select = screen.getByLabelText(de['console.forward.target']);
    const group = (label: string) => within(select).getByRole('group', { name: label });
    expect(within(group(de['console.forward.parents'])).getAllByRole('option').map((o) => o.textContent)).toEqual(['Berlin']);
    expect(within(group(de['console.forward.siblings'])).getAllByRole('option').map((o) => o.textContent)).toEqual(['Spandau']);
    expect(within(group(de['console.forward.contacts'])).getAllByRole('option').map((o) => o.textContent)).toEqual(['Verkehrslenkung Berlin (vlb@berlin.de)']);
  });

  it('requires a public note when forwarding', async () => {
    const submit = vi.fn(ok);
    render(
      <I18nProvider locale="de">
        <ForwardForm targets={forwardTargetsFrom(TREE, 't-nk', contacts)} submit={submit} />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByLabelText(de['console.forward.target']), { target: { value: 'contact:c-vlb' } });
    fireEvent.click(screen.getByRole('button', { name: de['console.forward.submit'] }));
    expect(await screen.findByRole('alert')).toHaveTextContent(de['console.forward.noteRequired']);
    expect(submit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(de['console.forward.note']), { target: { value: ' Passed to the VLB. ' } });
    fireEvent.click(screen.getByRole('button', { name: de['console.forward.submit'] }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ contactId: 'c-vlb', publicNote: 'Passed to the VLB.' }));
    expect(await screen.findByRole('status')).toHaveTextContent(de['console.forward.done']);
  });
});

describe('console: override form (US-27)', () => {
  it('blocks saving an override without a reason', async () => {
    const submit = vi.fn(ok);
    render(
      <I18nProvider locale="de">
        <OverrideForm override={null} submit={submit} />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByLabelText(de['console.override.level']), { target: { value: 'Critical' } });
    fireEvent.click(screen.getByRole('button', { name: de['console.override.submit'] }));
    expect(await screen.findByRole('alert')).toHaveTextContent(de['console.override.reasonRequired']);
    expect(screen.getByLabelText(de['console.override.reason'])).toHaveAttribute('aria-invalid', 'true');
    expect(submit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(de['console.override.reason']), { target: { value: 'Next to a school' } });
    fireEvent.click(screen.getByRole('button', { name: de['console.override.submit'] }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ level: 'Critical', reason: 'Next to a school' }));
  });

  it('clears an override with null, still with a reason', async () => {
    const submit = vi.fn(ok);
    render(
      <I18nProvider locale="de">
        <OverrideForm override={{ level: 'High', reason: 'x' }} submit={submit} />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByLabelText(de['console.override.level']), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(de['console.override.reason']), { target: { value: 'Back to normal' } });
    fireEvent.click(screen.getByRole('button', { name: de['console.override.submit'] }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ level: null, reason: 'Back to normal' }));
  });
});

describe('console: status form (US-28)', () => {
  it('needs a reason for Rejected and sends the public note', async () => {
    const submit = vi.fn(ok);
    render(
      <I18nProvider locale="de">
        <StatusForm current="acknowledged" submit={submit} />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByLabelText(de['console.status.label']), { target: { value: 'rejected' } });
    fireEvent.change(screen.getByLabelText(de['console.status.publicNote']), { target: { value: 'Private ground.' } });
    fireEvent.click(screen.getByRole('button', { name: de['console.status.submit'] }));
    expect(await screen.findByRole('alert')).toHaveTextContent(de['console.status.reasonRequired']);
    expect(submit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(de['console.status.reason']), { target: { value: 'Not public land' } });
    fireEvent.click(screen.getByRole('button', { name: de['console.status.submit'] }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ status: 'rejected', publicNote: 'Private ground.', reason: 'Not public land' }));
  });

  it('shows the API error translated', async () => {
    render(
      <I18nProvider locale="de">
        <StatusForm current="open" submit={async () => ({ ok: false, status: 409, error: 'invalid_transition', body: {} })} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: de['console.status.submit'] }));
    expect(await screen.findByRole('alert')).toHaveTextContent(de['error.invalid_transition']);
  });
});

describe('console: merge form (US-17)', () => {
  it('checks the report ID and asks before merging', async () => {
    const submit = vi.fn(ok);
    const onMerged = vi.fn();
    render(
      <I18nProvider locale="de">
        <MergeForm publicId="BE-NK-2026-0118" candidates={['BE-NK-2026-0112', 'BE-NK-2026-0118']} submit={submit} onMerged={onMerged} />
      </I18nProvider>,
    );
    const field = screen.getByLabelText(de['console.merge.into']);
    fireEvent.change(field, { target: { value: 'nonsense' } });
    fireEvent.click(screen.getByRole('button', { name: de['console.merge.submit'] }));
    expect(await screen.findByRole('alert')).toHaveTextContent(de['console.merge.invalidId']);
    fireEvent.change(field, { target: { value: 'be-nk-2026-0118' } });
    fireEvent.click(screen.getByRole('button', { name: de['console.merge.submit'] }));
    expect(await screen.findByRole('alert')).toHaveTextContent(de['console.merge.sameReport']);

    fireEvent.change(field, { target: { value: 'be-nk-2026-0112' } });
    fireEvent.click(screen.getByRole('button', { name: de['console.merge.submit'] }));
    const dialog = await screen.findByRole('dialog', { name: de['console.merge.confirmTitle'] });
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: de['console.merge.confirm'] }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ into: 'BE-NK-2026-0112' }));
    expect(onMerged).toHaveBeenCalledWith('BE-NK-2026-0112');
  });
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

  it('every console string has a German and an English entry (Phase 2)', () => {
    const keys = new Set(Object.keys(de));
    const consoleKeys = Object.keys(de).filter((k) => /^(console|forwarded|level|role|tenantStatus|tenantType)\./.test(k));
    expect(consoleKeys.length).toBeGreaterThan(200);
    for (const key of consoleKeys) expect(Object.keys(en), key).toContain(key);
    for (const l of LEVELS) expect(keys.has(`level.${l}`), l).toBe(true);
    for (const r of STAFF_ROLES) expect(keys.has(`role.${r}`), r).toBe(true);
    for (const s of TENANT_STATUSES) expect(keys.has(`tenantStatus.${s}`), s).toBe(true);
    for (const s of ['visible', 'held', 'removed']) expect(keys.has(`console.comments.state.${s}`), s).toBe(true);
    for (const code of ['not_staff', 'invalid_totp', 'challenge_expired', 'read_only', 'invalid_transition', 'reason_required', 'not_same_tenant', 'invalid_target', 'link_expired', 'forbidden_role'])
      expect(keys.has(`error.${code}`), code).toBe(true);
  });
});
