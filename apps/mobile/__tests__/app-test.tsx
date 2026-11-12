// Screen tests from the product plan (the prototype's "Citizen app" tab). The UI runs in German, the default.
// In @testing-library/react-native 14, render and fireEvent are async.
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';
import AccountScreen from '../src/app/account';
import CameraScreen from '../src/app/camera';
import ComposeScreen from '../src/app/compose';
import HomeScreen from '../src/app/index';
import NotLiveScreen from '../src/app/not-live';
import PostedScreen from '../src/app/posted';
import ReportDetailScreen from '../src/app/report/[publicId]';
import i18n from '../src/i18n';
import { EMPTY_DRAFT, type Draft } from '../src/report/DraftProvider';
import { fakeAccessToken, fakeAuth } from '../src/testing/fakeSupabase';
import { mockApi, renderApp, SIGN_IN_ROUTES, signInAs } from '../src/testing/helpers';

const ID = 'BE-NK-2026-0112';
const NK_ROUTE = { live: true, tenant: { name: 'Neukölln', office: 'Bezirksamt Neukölln', status: 'pilot' } };
const FK_ROUTE = { live: false, tenant: { name: 'Friedrichshain-Kreuzberg', office: null, status: 'not_live' } };
const REPORT = {
  publicId: ID,
  category: 'traffic_light',
  status: 'acknowledged',
  description: 'Fußgängerampel seit heute Morgen dunkel.',
  dangerous: true,
  lat: 52.4811,
  lon: 13.4353,
  createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  meTooCount: 20,
  tenantName: 'Neukölln',
  office: 'Bezirksamt Neukölln',
};
const params = useLocalSearchParams as jest.Mock;
const setFix = (accuracy: number, latitude = 52.4795, longitude = 13.4365) =>
  (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({ coords: { latitude, longitude, accuracy } });

async function completeSignIn() {
  await fireEvent.changeText(await screen.findByTestId('signin-identifier'), 'name@example.de');
  await fireEvent.press(screen.getByTestId('signin-send'));
  await fireEvent.changeText(await screen.findByTestId('signin-code'), '482913');
  await fireEvent.press(screen.getByTestId('signin-confirm'));
}

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

afterEach(async () => {
  await i18n.changeLanguage('de');
});

beforeEach(() => {
  jest.clearAllMocks();
  params.mockReturnValue({});
  setFix(12);
});

describe('citizen app screens', () => {
  test('map: shows the tenant name and no score or level on any card (US-15, US-24)', async () => {
    mockApi({
      'GET /public/route': { body: NK_ROUTE },
      // Even if the API ever sent score or level, the app drops them.
      'GET /public/reports': { body: { reports: [{ ...REPORT, distanceM: 80, score: 64.2, level: 'Critical', priority: 'High' }] } },
    });
    await renderApp(<HomeScreen />);
    expect(await screen.findByText('● Live in Neukölln')).toBeTruthy();
    const card = await screen.findByTestId(`report-card-${ID}`);
    expect(card).toHaveTextContent('Ampel', { exact: false });
    expect(screen.getByLabelText('Ampel, Bestätigt. Öffnet die Meldung.')).toBeTruthy();
    const rendered = JSON.stringify(screen.toJSON());
    expect(rendered).not.toMatch(/64\.2|Critical|Kritisch|score|priority|level/i);
  });

  test('map: a not-live area says so in the location chip (US-44)', async () => {
    mockApi({ 'GET /public/route': { body: FK_ROUTE }, 'GET /public/reports': { body: { reports: [] } } });
    await renderApp(<HomeScreen />);
    expect(await screen.findByText('○ Hier noch nicht live')).toBeTruthy();
    expect(screen.getByTestId('home-not-live')).toHaveTextContent('Kiezruf ist in Friedrichshain-Kreuzberg noch nicht live.', { exact: false });
  });

  test('map: filters are sent to the API (US-15)', async () => {
    const calls = mockApi({ 'GET /public/route': { body: NK_ROUTE }, 'GET /public/reports': { body: { reports: [] } } });
    await renderApp(<HomeScreen />);
    await screen.findByText('Hier gibt es noch keine Meldungen.');
    await fireEvent.press(screen.getByTestId('home-filters-toggle'));
    await fireEvent.press(screen.getByTestId('filter-category-pothole'));
    await fireEvent.press(screen.getByTestId('filter-status-open'));
    await fireEvent.press(screen.getByTestId('filter-age-7'));
    await waitFor(() =>
      expect(calls.filter((c) => c.path === '/public/reports').at(-1)?.query).toMatchObject({ category: 'pothole', status: 'open', maxAgeDays: '7' }),
    );
  });

  test('report detail: Me too opens sign-in for a guest, then counts the vote (US-01, US-18)', async () => {
    params.mockReturnValue({ publicId: ID });
    let voted = false;
    const calls = mockApi({
      ...SIGN_IN_ROUTES,
      [`GET /public/reports/${ID}`]: { body: { ...REPORT, photos: [{ url: 'https://photos.test/1.jpg' }] } },
      [`GET /public/reports/${ID}/comments`]: { body: { comments: [] } },
      [`GET /reports/${ID}/me`]: () => ({ body: { following: voted, meToo: voted, mine: false } }),
      [`PUT /reports/${ID}/me-too`]: () => {
        voted = true;
        return { body: { voted: true, meTooCount: 21 } };
      },
    });
    await renderApp(<ReportDetailScreen />);
    await fireEvent.press(await screen.findByTestId('detail-metoo'));
    expect(screen.getByTestId('signin-title')).toHaveTextContent('Anmelden für Me too');
    await completeSignIn();
    await waitFor(() => expect(screen.getByTestId('detail-metoo')).toHaveTextContent('Du und 20 weitere', { exact: false }));
    const vote = calls.find((c) => c.method === 'PUT' && c.path.endsWith('/me-too'))!;
    expect(vote.body).toEqual({ lat: 52.4795, lon: 13.4365, accuracyM: 12 });
    expect(vote.headers.Authorization).toBe('Bearer fresh-token');
    expect(screen.getByTestId('detail-follow')).toHaveTextContent('Du folgst', { exact: false });
  });

  test('report detail: Me too with a coarse fix asks to wait instead of voting (US-03)', async () => {
    params.mockReturnValue({ publicId: ID });
    await signInAs();
    setFix(180);
    const calls = mockApi({
      [`GET /public/reports/${ID}`]: { body: REPORT },
      [`GET /public/reports/${ID}/comments`]: { body: { comments: [] } },
      [`GET /reports/${ID}/me`]: { body: { following: false, meToo: false, mine: false } },
    });
    await renderApp(<ReportDetailScreen />);
    await fireEvent.press(await screen.findByTestId('detail-metoo'));
    expect(await screen.findByTestId('detail-metoo-error')).toHaveTextContent('Dein Standort ist zu ungenau', { exact: false });
    expect(calls.some((c) => c.path.endsWith('/me-too'))).toBe(false);
  });

  test('report detail: the API says not on site (D-03)', async () => {
    params.mockReturnValue({ publicId: ID });
    await signInAs();
    mockApi({
      [`GET /public/reports/${ID}`]: { body: REPORT },
      [`GET /public/reports/${ID}/comments`]: { body: { comments: [] } },
      [`GET /reports/${ID}/me`]: { body: { following: false, meToo: false, mine: false } },
      [`PUT /reports/${ID}/me-too`]: { status: 422, body: { error: 'not_on_site' } },
    });
    await renderApp(<ReportDetailScreen />);
    await fireEvent.press(await screen.findByTestId('detail-metoo'));
    expect(await screen.findByTestId('detail-metoo-error')).toHaveTextContent('Me too zählt nur vor Ort', { exact: false });
  });

  test("report detail: shows the office's public note (US-28)", async () => {
    params.mockReturnValue({ publicId: ID });
    mockApi({
      [`GET /public/reports/${ID}`]: { body: { ...REPORT, publicNote: 'Das Straßenamt repariert die Ampel diese Woche.' } },
      [`GET /public/reports/${ID}/comments`]: { body: { comments: [] } },
    });
    await renderApp(<ReportDetailScreen />);
    expect(await screen.findByTestId('detail-office-note')).toHaveTextContent('Hinweis des Amts', { exact: false });
    expect(screen.getByText('Das Straßenamt repariert die Ampel diese Woche.')).toBeTruthy();
  });

  test('report detail: status steps, Forwarded and comments with flag; a held comment says so (US-19, US-20)', async () => {
    params.mockReturnValue({ publicId: ID });
    await signInAs();
    let following = false;
    const calls = mockApi({
      [`GET /public/reports/${ID}`]: { body: { ...REPORT, status: 'forwarded' } },
      [`GET /public/reports/${ID}/comments`]: { body: { comments: [{ id: 'c1', body: 'Auf der anderen Seite auch.', createdAt: REPORT.createdAt }] } },
      [`GET /reports/${ID}/me`]: () => ({ body: { following, meToo: false, mine: false } }),
      [`POST /reports/${ID}/comments`]: { status: 201, body: { id: 'c2', held: true } },
      [`PUT /reports/${ID}/follow`]: () => {
        following = true;
        return { body: { following: true } };
      },
      'POST /comments/c1/flag': { status: 201, body: {} },
    });
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
    await renderApp(<ReportDetailScreen />);

    expect(await screen.findByTestId('detail-forwarded')).toBeTruthy();
    expect(screen.getByLabelText('Bestätigt, aktueller Stand')).toBeTruthy();
    expect(screen.getByLabelText('Offen, erledigt')).toBeTruthy();
    expect(await screen.findByText('Auf der anderen Seite auch.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('comment-flag-c1'));
    expect(await screen.findByText('Gemeldet. Danke.')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('comment-input'), 'Kinder queren hier um 8.');
    expect(screen.getByTestId('comment-count')).toHaveTextContent('Noch 476 Zeichen');
    await fireEvent.press(screen.getByTestId('comment-send'));
    expect(await screen.findByTestId('comment-note')).toHaveTextContent('Dein Kommentar wird geprüft', { exact: false });
    expect(calls.find((c) => c.method === 'POST' && c.path.endsWith('/comments'))?.body).toEqual({ body: 'Kinder queren hier um 8.' });

    await fireEvent.press(screen.getByTestId('detail-follow'));
    await waitFor(() => expect(screen.getByTestId('detail-follow')).toHaveTextContent('Du folgst', { exact: false }));
  });

  test('new report: the danger toggle shows the 112 / 110 banner (US-09)', async () => {
    mockApi({});
    await renderApp(<ComposeScreen />, { draft: composeDraft() });
    expect(screen.queryByTestId('emergency-banner')).toBeNull();
    await fireEvent(screen.getByTestId('report-dangerous'), 'valueChange', true);
    const banner = screen.getByTestId('emergency-banner');
    expect(banner).toHaveTextContent('Wenn jemand in Gefahr ist, ruf zuerst 112 oder 110 an.', { exact: false });
    expect(within(banner).getByLabelText('112 anrufen (Feuerwehr, Rettungsdienst)')).toBeTruthy();
    expect(within(banner).getByLabelText('110 anrufen (Polizei)')).toBeTruthy();
  });

  test('new report: names the receiving office before posting (US-41)', async () => {
    mockApi({});
    await renderApp(<ComposeScreen />, { draft: composeDraft() });
    expect(screen.getByTestId('compose-office')).toHaveTextContent('Geht an Bezirksamt Neukölln');
  });

  test('new report: "Other" needs a description, and posting signs in, uploads and posts (US-08, US-11)', async () => {
    const calls = mockApi({
      ...SIGN_IN_ROUTES,
      'POST /uploads': { status: 201, body: { key: 'originals/a/1.jpg', url: 'https://s3.test/put/1', method: 'PUT', headers: { 'Content-Type': 'image/jpeg' } } },
      'PUT /put/1': { status: 200 },
      'POST /reports': { status: 201, body: { publicId: 'BE-NK-2026-0119', status: 'processing', tenant: { name: 'Neukölln', office: 'Bezirksamt Neukölln' } } },
    });
    await renderApp(<ComposeScreen />, { draft: composeDraft() });
    await fireEvent.press(screen.getByTestId('report-post'));
    expect(screen.getByTestId('compose-error')).toHaveTextContent('Bitte wähle eine Kategorie.', { exact: false });

    await fireEvent.press(screen.getByTestId('category-community_other'));
    await fireEvent.press(screen.getByTestId('report-post'));
    expect(screen.getByTestId('compose-error')).toHaveTextContent('Bei „Sonstiges“ brauchen wir eine Beschreibung.', { exact: false });

    await fireEvent.changeText(screen.getByTestId('report-description'), 'Sofa auf dem Gehweg');
    await fireEvent.press(screen.getByTestId('report-post'));
    expect(screen.getByTestId('signin-title')).toHaveTextContent('Anmelden, um zu melden');
    await completeSignIn();

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({ pathname: '/posted', params: { publicId: 'BE-NK-2026-0119', office: 'Bezirksamt Neukölln' } }),
    );
    expect(calls.find((c) => c.path === '/uploads')?.body).toEqual({ contentType: 'image/jpeg' });
    expect(calls.find((c) => c.method === 'PUT' && c.path === '/put/1')?.headers).toEqual({ 'Content-Type': 'image/jpeg' });
    expect(calls.find((c) => c.path === '/reports')?.body).toMatchObject({
      category: 'community_other',
      description: 'Sofa auf dem Gehweg',
      dangerous: false,
      capture: { lat: 52.4795, lon: 13.4365, accuracyM: 12 },
      photoKeys: ['originals/a/1.jpg'],
    });
  });

  test('camera: accuracy worse than 100 m asks to wait or step outside (US-03)', async () => {
    setFix(160);
    const calls = mockApi({ 'POST /public/report-attempts': { body: NK_ROUTE } });
    await renderApp(<CameraScreen />);
    await fireEvent.press(screen.getByTestId('camera-shutter'));
    expect(await screen.findByTestId('camera-accuracy')).toHaveTextContent('nur auf 160 m genau', { exact: false });
    expect(calls).toHaveLength(0);

    setFix(20);
    await fireEvent.press(screen.getByTestId('camera-accuracy-retry'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/compose'));
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();
  });

  test('camera: outside a live tenant goes to "not live here yet" (US-44)', async () => {
    setFix(10, 52.5023, 13.4185);
    mockApi({ 'POST /public/report-attempts': { body: FK_ROUTE } });
    await renderApp(<CameraScreen />);
    await fireEvent.press(screen.getByTestId('camera-shutter'));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/not-live',
        params: { tenant: 'Friedrichshain-Kreuzberg', lat: '52.5023', lon: '13.4185' },
      }),
    );
  });

  test('camera: a gallery photo older than 48 h is refused (US-06)', async () => {
    mockApi({ 'POST /public/report-attempts': { body: NK_ROUTE } });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///old.jpg', width: 100, height: 100, exif: { GPSLatitude: 52.4795, GPSLongitude: 13.4365, GPSHPositioningError: 5, DateTimeOriginal: '2020:01:01 10:00:00' } }],
    });
    await renderApp(<CameraScreen />);
    await fireEvent.press(screen.getByTestId('camera-gallery'));
    expect(await screen.findByTestId('camera-message')).toHaveTextContent('Das Foto ist älter als 48 Stunden.');
    expect(router.replace).not.toHaveBeenCalled();
  });

  test('camera: location permission is foreground only and asked at capture, never on open (US-32)', async () => {
    mockApi({ 'POST /public/report-attempts': { body: NK_ROUTE } });
    await renderApp(<CameraScreen />);
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('camera-shutter'));
    await waitFor(() => expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1));
    expect((Location as Record<string, unknown>).requestBackgroundPermissionsAsync).toBeUndefined();
  });

  test('not live here yet: offers "Tell me when it starts here" (US-44)', async () => {
    params.mockReturnValue({ tenant: 'Friedrichshain-Kreuzberg', lat: '52.5023', lon: '13.4185' });
    await signInAs();
    const calls = mockApi({ 'POST /go-live-alerts': { status: 201, body: {} } });
    await renderApp(<NotLiveScreen />);
    expect(screen.getByTestId('notlive-heading')).toHaveTextContent('Kiezruf ist in Friedrichshain-Kreuzberg noch nicht live');
    await fireEvent.press(screen.getByTestId('notlive-notify'));
    await waitFor(() => expect(screen.getByTestId('notlive-notify')).toHaveTextContent('Wir sagen dir Bescheid', { exact: false }));
    expect(calls.find((c) => c.path === '/go-live-alerts')?.body).toEqual({ lat: 52.5023, lon: 13.4185 });
  });

  test('report posted: shows the report ID with the tenant code (US-11, US-41)', async () => {
    params.mockReturnValue({ publicId: 'BE-NK-2026-0119', office: 'Bezirksamt Neukölln' });
    mockApi({});
    await renderApp(<PostedScreen />);
    expect(screen.getByTestId('posted-id')).toHaveTextContent('#BE-NK-2026-0119');
    expect(screen.getByText(/Gesendet an Bezirksamt Neukölln/)).toBeTruthy();
  });

  test('account: language switch between Deutsch and English (US-35)', async () => {
    await signInAs();
    const calls = mockApi({
      'GET /me': { body: { id: 'a1', email: 'name@example.de', locale: 'de' } },
      'GET /me/notification-settings': { body: { statusChange: { push: true, email: true }, goLive: { push: true, email: true } } },
      'GET /me/reports': { body: { reports: [] } },
      'GET /me/follows': { body: { reports: [] } },
      'PATCH /me': { status: 204 },
    });
    await renderApp(<AccountScreen />);
    expect(screen.getByText('Dein Konto')).toBeTruthy();
    await screen.findByText('name@example.de · bestätigt');
    await fireEvent.press(screen.getByTestId('language-en'));
    expect(await screen.findByText('Your account')).toBeTruthy();
    expect(screen.getByTestId('language-en')).toBeChecked();
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH' && c.path === '/me')?.body).toEqual({ locale: 'en' }));
    await i18n.changeLanguage('de');
  });

  test('account: notification settings save per type and channel (US-29)', async () => {
    await signInAs();
    const calls = mockApi({
      'GET /me': { body: { id: 'a1', email: 'name@example.de', locale: 'de' } },
      'GET /me/notification-settings': { body: { statusChange: { push: true, email: true }, goLive: { push: true, email: true } } },
      'GET /me/reports': { body: { reports: [{ publicId: 'BE-NK-2026-0119', category: 'pothole', status: 'processing', description: null, createdAt: REPORT.createdAt, tenantName: 'Neukölln', office: 'Bezirksamt Neukölln' }] } },
      'GET /me/follows': { body: { reports: [] } },
      'PUT /me/notification-settings': { status: 204 },
    });
    await renderApp(<AccountScreen />);
    await fireEvent(await screen.findByTestId('setting-goLive-email'), 'valueChange', false);
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT' && c.path === '/me/notification-settings')?.body).toEqual({
        statusChange: { push: true, email: true },
        goLive: { push: true, email: false },
      }),
    );
    expect(await screen.findByTestId('report-card-BE-NK-2026-0119')).toHaveTextContent('Wird geprüft', { exact: false });
  });

  test('account: delete my account asks for confirmation (US-34)', async () => {
    await signInAs();
    const calls = mockApi({
      'GET /me': { body: { id: 'a1', email: 'name@example.de', locale: 'de' } },
      'GET /me/notification-settings': { body: { statusChange: { push: true, email: true }, goLive: { push: true, email: true } } },
      'GET /me/reports': { body: { reports: [] } },
      'GET /me/follows': { body: { reports: [] } },
      'DELETE /me': { status: 204 },
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await renderApp(<AccountScreen />);
    await fireEvent.press(await screen.findByTestId('account-delete'));
    expect(alert).toHaveBeenCalledWith('Konto löschen?', expect.stringContaining('eine Nachbarin oder ein Nachbar'), expect.any(Array));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    const buttons = alert.mock.calls[0]![2]!;
    await waitFor(async () => buttons.find((b) => b.style === 'destructive')!.onPress!());
    expect(await screen.findByTestId('account-notice')).toHaveTextContent('Dein Konto wurde gelöscht.');
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/me')).toBe(true);
    expect(fakeAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(fakeAccessToken()).toBeNull();
    expect(screen.getByTestId('account-signin')).toBeTruthy();
  });
});
