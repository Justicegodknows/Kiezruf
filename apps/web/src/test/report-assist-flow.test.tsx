// The web compose form with the Phase 3 help: the category suggested from the first photo (US-14) and
// "Already reported?" before posting (US-13).
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewReportForm } from '@/components/NewReportForm';
import de from '@/i18n/de.json';
import type { PhotoMeta } from '@/lib/photo-check';
import { mockFetch, mockGeolocation, renderWithProviders, type Call } from './helpers';

const exif = vi.hoisted(() => ({ next: [] as PhotoMeta[] }));
vi.mock('maplibre-gl', () => ({
  Map: class {
    constructor() {
      throw new Error('no WebGL in jsdom');
    }
  },
  Marker: class {},
}));
vi.mock('@/lib/exif', () => ({ readPhotoMeta: async () => exif.next.shift() ?? { capturedAt: null, lat: null, lon: null } }));

const MATCH = { publicId: 'BE-NK-2026-0112', category: 'pothole', status: 'open', distanceM: 35, meTooCount: 12, photo: 'https://photos.test/blurred.jpg', similarity: 0.92 };

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:preview', revokeObjectURL: () => {} }));
  exif.next = [{ capturedAt: new Date(), lat: 52.48, lon: 13.43 }];
  mockGeolocation({ lat: 52.48, lon: 13.43, accuracy: 12 });
});

afterEach(() => {
  vi.unstubAllGlobals();
  exif.next = [];
});

function serve(opts: { suggestion: unknown; matches: unknown[] }) {
  return mockFetch((call: Call) => {
    const { method, path } = call;
    if (path === '/api/session') return { body: { signedIn: true, email: 'a@example.org' } };
    if (path === '/api/public/report-attempts') return { body: { live: true, tenant: { name: 'Neukölln', office: 'Ordnungsamt Neukölln', status: 'pilot' } } };
    if (path === '/api/uploads') return { status: 201, body: { key: 'originals/acc/1.jpg', url: 'https://storage.test/put/1' } };
    if (method === 'PUT' && path === '/put/1') return { status: 200 };
    if (path === '/api/uploads/suggest') return { body: opts.suggestion };
    if (path === '/api/reports/duplicates') return { body: { matches: opts.matches } };
    if (path === `/api/reports/${MATCH.publicId}/co-report`) return { status: 201, body: { publicId: MATCH.publicId } };
    if (path === '/api/reports') return { status: 201, body: { publicId: 'BE-NK-2026-0118', status: 'processing' } };
    return undefined;
  });
}

async function fillIn() {
  renderWithProviders(<NewReportForm />);
  fireEvent.click(screen.getByRole('button', { name: de['compose.locate'] }));
  await screen.findByText(/Ihre Meldung geht an/);
  fireEvent.change(screen.getByLabelText(de['compose.choosePhotos']), { target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] } });
}

describe('category suggested from the photo (US-14)', () => {
  it('pre-selects a confident suggestion, says so, lets the citizen change it and sends it as feedback', async () => {
    const calls = serve({ suggestion: { category: 'pothole', confidence: 0.86, preselect: true }, matches: [] });
    await fillIn();
    const traffic = screen.getByRole('group', { name: de['group.traffic'] });
    await waitFor(() => expect(within(traffic).getByLabelText(de['category.pothole'])).toBeChecked());
    expect(screen.getByText(/Anhand Ihres Fotos vorgeschlagen: Schlagloch/)).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/api/uploads/suggest')?.body).toEqual({ key: 'originals/acc/1.jpg' });

    fireEvent.click(within(traffic).getByLabelText(de['category.bike_lane']));
    expect(screen.queryByText(/Anhand Ihres Fotos vorgeschlagen/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: de['review.post'] }));
    expect(await screen.findByRole('heading', { name: de['posted.title'] })).toBeInTheDocument();
    const posted = calls.find((c) => c.path === '/api/reports');
    expect(posted?.body).toMatchObject({ category: 'bike_lane', photoKeys: ['originals/acc/1.jpg'], suggestion: { category: 'pothole', confidence: 0.86 } });
    // The early upload is reused, not repeated.
    expect(calls.filter((c) => c.path === '/api/uploads')).toHaveLength(1);
  });

  it('pre-selects nothing below the threshold and posts without a suggestion', async () => {
    const calls = serve({ suggestion: { category: 'pothole', confidence: 0.62, preselect: false }, matches: [] });
    await fillIn();
    await waitFor(() => expect(calls.some((c) => c.path === '/api/uploads/suggest')).toBe(true));
    const traffic = screen.getByRole('group', { name: de['group.traffic'] });
    expect(within(traffic).getByLabelText(de['category.pothole'])).not.toBeChecked();
    expect(screen.queryByText(/Anhand Ihres Fotos vorgeschlagen/)).not.toBeInTheDocument();
    fireEvent.click(within(traffic).getByLabelText(de['category.pothole']));
    fireEvent.click(screen.getByRole('button', { name: de['review.post'] }));
    await screen.findByRole('heading', { name: de['posted.title'] });
    expect(calls.find((c) => c.path === '/api/reports')?.body).not.toHaveProperty('suggestion');
  });
});

describe('"Already reported?" before posting (US-13)', () => {
  it('shows the matches and adds the photo to the chosen report instead of posting', async () => {
    const calls = serve({ suggestion: { category: 'pothole', confidence: 0.9, preselect: true }, matches: [MATCH] });
    await fillIn();
    const traffic = screen.getByRole('group', { name: de['group.traffic'] });
    await waitFor(() => expect(within(traffic).getByLabelText(de['category.pothole'])).toBeChecked());
    fireEvent.click(screen.getByRole('button', { name: de['review.post'] }));

    const panel = (await screen.findByRole('heading', { name: de['dup.title'] })).closest('section')!;
    expect(calls.find((c) => c.path === '/api/reports/duplicates')?.body).toEqual({ lat: 52.48, lon: 13.43, category: 'pothole', photoKey: 'originals/acc/1.jpg' });
    expect(within(panel).getByRole('img', { name: /BE-NK-2026-0112/ })).toHaveAttribute('src', MATCH.photo);
    expect(panel).toHaveTextContent('35 m entfernt');
    expect(panel).toHaveTextContent('12 Stimmen');
    expect(panel).toHaveTextContent(de['status.open']);
    // No score or level for citizens (US-24).
    expect(panel).not.toHaveTextContent(/Kritisch|Score/);
    expect(screen.getByRole('button', { name: de['review.post'] })).toBeDisabled();

    fireEvent.click(within(panel).getByRole('button', { name: new RegExp(de['dup.join']) }));
    expect(await screen.findByRole('heading', { name: de['dup.joinedTitle'] })).toBeInTheDocument();
    expect(calls.find((c) => c.path === `/api/reports/${MATCH.publicId}/co-report`)?.body).toMatchObject({ photoKeys: ['originals/acc/1.jpg'], capture: { lat: 52.48, lon: 13.43, accuracyM: 12 } });
    expect(calls.some((c) => c.path === '/api/reports')).toBe(false);
    expect(screen.getByRole('link', { name: de['dup.showReport'] })).toHaveAttribute('href', '/berlin/berlin/be-nk-2026-0112');
  });

  it('"No, mine is new" posts the report', async () => {
    const calls = serve({ suggestion: { category: 'pothole', confidence: 0.9, preselect: true }, matches: [MATCH] });
    await fillIn();
    const traffic = screen.getByRole('group', { name: de['group.traffic'] });
    await waitFor(() => expect(within(traffic).getByLabelText(de['category.pothole'])).toBeChecked());
    fireEvent.click(screen.getByRole('button', { name: de['review.post'] }));
    fireEvent.click(await screen.findByRole('button', { name: de['dup.new'] }));
    expect(await screen.findByRole('heading', { name: de['posted.title'] })).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/api/reports')).toHaveLength(1);
  });

  it('posts straight away when nothing matches', async () => {
    const calls = serve({ suggestion: { category: null, confidence: null, preselect: false }, matches: [] });
    await fillIn();
    await waitFor(() => expect(calls.some((c) => c.path === '/api/uploads/suggest')).toBe(true));
    fireEvent.click(within(screen.getByRole('group', { name: de['group.traffic'] })).getByLabelText(de['category.pothole']));
    fireEvent.click(screen.getByRole('button', { name: de['review.post'] }));
    expect(await screen.findByRole('heading', { name: de['posted.title'] })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: de['dup.title'] })).not.toBeInTheDocument();
    expect(calls.findIndex((c) => c.path === '/api/reports/duplicates')).toBeLessThan(calls.findIndex((c) => c.path === '/api/reports'));
  });
});
