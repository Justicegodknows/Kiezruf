// Phase 3 report flow: category suggestion from the photo (US-14) and "Already reported?" (US-13).
// The compose and duplicates screens render side by side under one draft, as in the app's stack.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import DuplicatesScreen from '../src/app/duplicates';
import ComposeScreen from '../src/app/compose';
import ReportDetailScreen from '../src/app/report/[publicId]';
import { EMPTY_DRAFT, type Draft } from '../src/report/DraftProvider';
import { type Call, mockApi, renderApp, signInAs } from '../src/testing/helpers';

const MATCH_ID = 'BE-NK-2026-0112';
const MATCH = {
  publicId: MATCH_ID,
  category: 'traffic_light',
  status: 'acknowledged',
  distanceM: 35,
  meTooCount: 20,
  photo: { url: 'https://photos.test/blurred/0112.jpg' },
  similarity: 0.91,
};
const POSTED = { status: 201, body: { publicId: 'BE-NK-2026-0119', status: 'processing', tenant: { name: 'Neukölln', office: 'Bezirksamt Neukölln' } } };
const params = useLocalSearchParams as jest.Mock;

const composeDraft = (over: Partial<Draft> = {}): Draft => ({
  ...EMPTY_DRAFT,
  photos: [
    {
      id: 'p1',
      uri: 'file:///p1.jpg',
      width: 4032,
      height: 3024,
      capture: { lat: 52.4795, lon: 13.4365, accuracyM: 12, capturedAt: new Date() },
      source: 'camera',
    },
  ],
  route: { tenantName: 'Neukölln', office: 'Bezirksamt Neukölln' },
  ...over,
});

/** Upload routes; the key counts up so a second upload of the same photo would show. */
function uploadRoutes() {
  let n = 0;
  return {
    'POST /uploads': () => {
      n += 1;
      return { status: 201, body: { key: `originals/a/${n}.jpg`, url: `https://s3.test/put/${n}`, method: 'PUT', headers: { 'Content-Type': 'image/jpeg' } } };
    },
    'PUT /put/1': { status: 200 },
    'PUT /put/2': { status: 200 },
  };
}

const find = (calls: Call[], method: string, path: string) => calls.filter((c) => c.method === method && c.path === path);

async function renderFlow(draft = composeDraft()) {
  await signInAs();
  await renderApp(
    <>
      <ComposeScreen />
      <DuplicatesScreen />
    </>,
    { draft },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  params.mockReturnValue({});
});

describe('category suggestion (US-14)', () => {
  test('at 0.80 the suggested category is pre-selected and says it came from the photo', async () => {
    const calls = mockApi({ ...uploadRoutes(), 'POST /uploads/suggest': { body: { category: 'traffic_light', confidence: 0.8, preselect: true } } });
    await renderFlow();
    expect(await screen.findByTestId('compose-suggested')).toHaveTextContent('Anhand deines Fotos vorgeschlagen: Ampel', { exact: false });
    expect(screen.getByTestId('category-traffic_light')).toBeChecked();
    expect(find(calls, 'POST', '/uploads/suggest')[0]!.body).toEqual({ key: 'originals/a/1.jpg' });

    // The citizen can change it; the note goes away.
    await fireEvent.press(screen.getByTestId('category-pothole'));
    expect(screen.getByTestId('category-pothole')).toBeChecked();
    expect(screen.queryByTestId('compose-suggested')).toBeNull();
  });

  test('below 0.80 nothing is pre-selected', async () => {
    const calls = mockApi({ ...uploadRoutes(), 'POST /uploads/suggest': { body: { category: 'traffic_light', confidence: 0.79, preselect: false } } });
    await renderFlow();
    await waitFor(() => expect(find(calls, 'POST', '/uploads/suggest')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByTestId('compose-suggesting')).toBeNull());
    expect(screen.getByTestId('category-traffic_light')).not.toBeChecked();
    expect(screen.queryByTestId('compose-suggested')).toBeNull();
  });

  test('a guest gets no suggestion: uploads need a session', async () => {
    const calls = mockApi({});
    await renderApp(<ComposeScreen />, { draft: composeDraft() });
    await screen.findByTestId('compose-screen');
    expect(calls.some((c) => c.path.startsWith('/uploads'))).toBe(false);
  });

  test('a failed suggestion does not block posting, and the photo is uploaded only once', async () => {
    const calls = mockApi({
      ...uploadRoutes(),
      'POST /uploads/suggest': { status: 504, body: { error: 'timeout' } },
      'POST /reports/duplicates': { body: { matches: [] } },
      'POST /reports': POSTED,
    });
    await renderFlow();
    await waitFor(() => expect(find(calls, 'POST', '/uploads/suggest')).toHaveLength(1));
    expect(screen.getByTestId('category-traffic_light')).not.toBeChecked();

    await fireEvent.press(screen.getByTestId('category-pothole'));
    await fireEvent.press(screen.getByTestId('report-post'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: '/posted', params: { publicId: 'BE-NK-2026-0119', office: 'Bezirksamt Neukölln' } }));
    expect(find(calls, 'POST', '/uploads')).toHaveLength(1);
    const body = find(calls, 'POST', '/reports')[0]!.body as Record<string, unknown>;
    expect(body).toMatchObject({ category: 'pothole', photoKeys: ['originals/a/1.jpg'] });
    expect(body).not.toHaveProperty('suggestion');
  });

  test('the suggestion that was shown is sent with the report, also when the citizen changed the category', async () => {
    const calls = mockApi({
      ...uploadRoutes(),
      'POST /uploads/suggest': { body: { category: 'traffic_light', confidence: 0.93, preselect: true } },
      'POST /reports/duplicates': { body: { matches: [] } },
      'POST /reports': POSTED,
    });
    await renderFlow();
    await screen.findByTestId('compose-suggested');
    await fireEvent.press(screen.getByTestId('category-street_lighting'));
    await fireEvent.press(screen.getByTestId('report-post'));
    await waitFor(() => expect(find(calls, 'POST', '/reports')).toHaveLength(1));
    expect(find(calls, 'POST', '/reports')[0]!.body).toMatchObject({
      category: 'street_lighting',
      suggestion: { category: 'traffic_light', confidence: 0.93 },
    });
  });
});

describe('"Already reported?" (US-13)', () => {
  const routes = (extra: Record<string, unknown> = {}) => ({
    ...uploadRoutes(),
    'POST /uploads/suggest': { body: { category: null, confidence: null, preselect: false } },
    'POST /reports/duplicates': { body: { matches: [MATCH] } },
    'POST /reports': POSTED,
    ...extra,
  });

  async function postWithMatches(calls: Call[]) {
    await renderFlow();
    await waitFor(() => expect(find(calls, 'POST', '/uploads/suggest')).toHaveLength(1));
    await fireEvent.press(screen.getByTestId('category-traffic_light'));
    await fireEvent.press(screen.getByTestId('report-post'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/duplicates'));
  }

  test('with matches: shows them, "Add my photo" co-reports and opens that report', async () => {
    const calls = mockApi(routes({ [`POST /reports/${MATCH_ID}/co-report`]: { status: 201, body: { publicId: MATCH_ID } } }));
    await postWithMatches(calls);

    expect(find(calls, 'POST', '/reports/duplicates')[0]!.body).toEqual({ lat: 52.4795, lon: 13.4365, category: 'traffic_light', photoKey: 'originals/a/1.jpg' });
    expect(find(calls, 'POST', '/reports')).toHaveLength(0);

    const card = await screen.findByTestId(`dup-match-${MATCH_ID}`);
    expect(card).toHaveTextContent('Ampel', { exact: false });
    expect(card).toHaveTextContent('Bestätigt · 40 m entfernt', { exact: false });
    expect(card).toHaveTextContent('20 Me too', { exact: false });
    expect(screen.getByLabelText('Unkenntlich gemachtes Foto der Meldung Ampel')).toBeTruthy();
    expect(screen.getByLabelText('Mein Foto zur Meldung Ampel in 40 m Entfernung hinzufügen')).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`dup-add-${MATCH_ID}`));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: '/report/[publicId]', params: { publicId: MATCH_ID, coReported: '1' } }));
    const co = find(calls, 'POST', `/reports/${MATCH_ID}/co-report`)[0]!;
    expect(co.body).toEqual({
      capture: { lat: 52.4795, lon: 13.4365, accuracyM: 12, capturedAt: expect.any(String) },
      photoKeys: ['originals/a/1.jpg'],
    });
    expect(co.headers.Authorization).toBe('Bearer test-token');
    expect(find(calls, 'POST', '/uploads')).toHaveLength(1);
    expect(find(calls, 'POST', '/reports')).toHaveLength(0);
  });

  test('co-reporting beyond 150 m says so', async () => {
    const calls = mockApi(routes({ [`POST /reports/${MATCH_ID}/co-report`]: { status: 422, body: { error: 'not_on_site' } } }));
    await postWithMatches(calls);
    await fireEvent.press(await screen.findByTestId(`dup-add-${MATCH_ID}`));
    expect(await screen.findByTestId('dup-error')).toHaveTextContent('Ein Foto kannst du nur bis 150 m Entfernung hinzufügen.', { exact: false });
    expect(router.push).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/report/[publicId]' }));
  });

  test('"No, mine is new" posts the report', async () => {
    const calls = mockApi(routes());
    await postWithMatches(calls);
    await fireEvent.press(await screen.findByTestId('dup-new'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: '/posted', params: { publicId: 'BE-NK-2026-0119', office: 'Bezirksamt Neukölln' } }));
    expect(find(calls, 'POST', '/reports')[0]!.body).toMatchObject({ category: 'traffic_light', photoKeys: ['originals/a/1.jpg'] });
    expect(find(calls, 'POST', '/uploads')).toHaveLength(1);
  });

  test('without matches it goes straight to posting', async () => {
    const calls = mockApi(routes({ 'POST /reports/duplicates': { body: { matches: [] } } }));
    await renderFlow();
    await fireEvent.press(screen.getByTestId('category-traffic_light'));
    await fireEvent.press(screen.getByTestId('report-post'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: '/posted', params: { publicId: 'BE-NK-2026-0119', office: 'Bezirksamt Neukölln' } }));
    expect(router.push).not.toHaveBeenCalledWith('/duplicates');
    expect(find(calls, 'POST', '/reports/duplicates')).toHaveLength(1);
  });

  test('a failed duplicate check does not block posting', async () => {
    const calls = mockApi(routes({ 'POST /reports/duplicates': { status: 500, body: { error: 'unknown' } } }));
    await renderFlow();
    await fireEvent.press(screen.getByTestId('category-traffic_light'));
    await fireEvent.press(screen.getByTestId('report-post'));
    await waitFor(() => expect(find(calls, 'POST', '/reports')).toHaveLength(1));
    expect(router.push).not.toHaveBeenCalledWith('/duplicates');
  });

  test('the report opened after co-reporting confirms the photo was added', async () => {
    params.mockReturnValue({ publicId: MATCH_ID, coReported: '1' });
    mockApi({
      [`GET /public/reports/${MATCH_ID}`]: {
        body: { ...MATCH, photo: undefined, lat: 52.4797, lon: 13.4365, createdAt: new Date().toISOString(), tenantName: 'Neukölln', office: 'Bezirksamt Neukölln' },
      },
      [`GET /public/reports/${MATCH_ID}/comments`]: { body: { comments: [] } },
    });
    await renderApp(<ReportDetailScreen />);
    expect(await screen.findByTestId('detail-co-reported')).toHaveTextContent('Dein Foto wurde hinzugefügt. Du folgst jetzt dieser Meldung.');
  });
});
