// Component tests for the detail comments (US-19) and the web compose form (US-04, US-08, US-09, US-44).
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Comments } from '@/components/Comments';
import { NewReportForm } from '@/components/NewReportForm';
import de from '@/i18n/de.json';
import type { PhotoMeta } from '@/lib/photo-check';
import { mockFetch, mockGeolocation, renderWithProviders } from './helpers';

const exif = vi.hoisted(() => ({ next: [] as PhotoMeta[] }));
// jsdom has no WebGL; the pin map fails quietly and the keyboard buttons remain.
vi.mock('maplibre-gl', () => ({
  Map: class {
    constructor() {
      throw new Error('no WebGL in jsdom');
    }
  },
  Marker: class {},
}));
vi.mock('@/lib/exif',() => ({ readPhotoMeta: async () => exif.next.shift() ?? { capturedAt: null, lat: null, lon: null } }));

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:preview', revokeObjectURL: () => {} }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  exif.next = [];
});

describe('citizen web: comments (US-19)', () => {
  const ID = 'BE-NK-2026-0112';
  const COMMENT_ID = '0b6f3f3e-6c43-4a8e-9f62-6a1f1b1f2c3d';

  it('lists comments without author and says when a new one is held for review', async () => {
    const calls = mockFetch(({ method, path }) => {
      if (path === '/api/session') return { body: { signedIn: true } };
      if (path === `/api/public/reports/${ID}/comments`) return { body: { comments: [{ id: COMMENT_ID, body: 'Same on the other side.', createdAt: '2026-11-11T10:00:00Z' }] } };
      if (method === 'POST' && path === `/api/reports/${ID}/comments`) return { status: 201, body: { id: 'x', held: true } };
      return undefined;
    });
    renderWithProviders(<Comments publicId={ID} />);
    expect(await screen.findByText('Same on the other side.')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(de['comments.neighbour']))).toBeInTheDocument();

    const field = screen.getByLabelText(de['comments.add']);
    expect(field).toHaveAttribute('maxLength', '500');
    fireEvent.change(field, { target: { value: 'You idiots' } });
    fireEvent.click(screen.getByRole('button', { name: de['comments.submit'] }));
    expect(await screen.findByText(de['comments.held'])).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ body: 'You idiots' });
  });

  it('has a flag button on every comment', async () => {
    const calls = mockFetch(({ method, path }) => {
      if (path === '/api/session') return { body: { signedIn: true } };
      if (path === `/api/public/reports/${ID}/comments`)
        return {
          body: {
            comments: [
              { id: COMMENT_ID, body: 'One', createdAt: '2026-11-11T10:00:00Z' },
              { id: '1b6f3f3e-6c43-4a8e-9f62-6a1f1b1f2c3d', body: 'Two', createdAt: '2026-11-11T11:00:00Z' },
            ],
          },
        };
      if (method === 'POST' && path === `/api/comments/${COMMENT_ID}/flag`) return { status: 201, body: {} };
      return undefined;
    });
    renderWithProviders(<Comments publicId={ID} />);
    await screen.findByText('One');
    expect(screen.getAllByRole('button', { name: /Kommentar \d melden/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Kommentar 1 melden' }));
    expect(await screen.findByText(de['comments.flagged'])).toBeInTheDocument();
    expect(calls.some((c) => c.path === `/api/comments/${COMMENT_ID}/flag`)).toBe(true);
  });
});

describe('citizen web: report from the web', () => {
  function liveRoute() {
    return mockFetch(({ path }) => {
      if (path === '/api/session') return { body: { signedIn: false } };
      if (path === '/api/public/report-attempts') return { body: { live: true, tenant: { name: 'Neukölln', office: 'Ordnungsamt Neukölln', status: 'pilot' } } };
      return undefined;
    });
  }

  it('asks to wait or step outside when the location is worse than 100 m (US-03)', async () => {
    liveRoute();
    mockGeolocation({ lat: 52.48, lon: 13.43, accuracy: 180 });
    renderWithProviders(<NewReportForm />);
    fireEvent.click(screen.getByRole('button', { name: de['compose.locate'] }));
    expect(await screen.findByRole('alert')).toHaveTextContent(de['error.accuracy_too_low']);
  });

  it('names the receiving office before posting (US-41)', async () => {
    liveRoute();
    mockGeolocation({ lat: 52.48, lon: 13.43, accuracy: 15 });
    renderWithProviders(<NewReportForm />);
    fireEvent.click(screen.getByRole('button', { name: de['compose.locate'] }));
    expect(await screen.findByText(/Ihre Meldung geht an: Ordnungsamt Neukölln \(Neukölln\)/)).toBeInTheDocument();
  });

  it('shows "not live here yet" with the go-live button (US-44)', async () => {
    mockFetch(({ path }) => {
      if (path === '/api/session') return { body: { signedIn: false } };
      if (path === '/api/public/report-attempts') return { body: { live: false, tenant: { name: 'Mitte', office: null, status: 'not_live' } } };
      return undefined;
    });
    mockGeolocation({ lat: 52.52, lon: 13.4, accuracy: 15 });
    renderWithProviders(<NewReportForm />);
    fireEvent.click(screen.getByRole('button', { name: de['compose.locate'] }));
    expect(await screen.findByRole('heading', { name: de['notLive.title'] })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: de['notLive.notifyMe'] })).toBeInTheDocument();
  });

  it('keeps a photo without location and time as a draft only and explains why (US-04)', async () => {
    liveRoute();
    exif.next = [{ capturedAt: null, lat: null, lon: null }];
    renderWithProviders(<NewReportForm />);
    const input = screen.getByLabelText(de['compose.choosePhotos']);
    fireEvent.change(input, { target: { files: [new File(['x'], 'desktop.jpg', { type: 'image/jpeg' })] } });
    expect(await screen.findByText(/Ort oder Aufnahmezeit fehlen in der Datei: nur als Entwurf/)).toBeInTheDocument();
    expect(screen.getByText(/Mindestens ein Foto erfüllt die Vor-Ort-Regeln nicht/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: de['review.post'] })).toBeDisabled();
    expect(screen.getByRole('button', { name: de['review.saveDraft'] })).toBeEnabled();
  });

  it('requires a description for "Other" (US-08) and shows 112 / 110 when dangerous (US-09)', async () => {
    liveRoute();
    renderWithProviders(<NewReportForm />);
    const traffic = screen.getByRole('group', { name: de['group.traffic'] });
    fireEvent.click(within(traffic).getByLabelText(de['category.traffic_other']));
    expect(screen.getByLabelText(de['compose.descriptionRequired'])).toBeRequired();
    expect(screen.getByText(de['review.missingDescription'])).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: de['compose.dangerous'] }));
    const banner = await screen.findByRole('alert');
    expect(within(banner).getByRole('link', { name: '112' })).toHaveAttribute('href', 'tel:112');
    expect(within(banner).getByRole('link', { name: '110' })).toHaveAttribute('href', 'tel:110');
  });

  it('accepts at most three photos (US-06)', async () => {
    liveRoute();
    const ok = { capturedAt: new Date(), lat: 52.48, lon: 13.43 };
    exif.next = [ok, ok, ok, ok];
    renderWithProviders(<NewReportForm />);
    const files = [1, 2, 3, 4].map((n) => new File(['x'], `p${n}.jpg`, { type: 'image/jpeg' }));
    fireEvent.change(screen.getByLabelText(de['compose.choosePhotos']), { target: { files } });
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Foto \d entfernen/ })).toHaveLength(3));
    expect(screen.getByRole('alert')).toHaveTextContent('Höchstens 3 Fotos');
  });
});
