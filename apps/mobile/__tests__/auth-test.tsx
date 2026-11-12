// Sign in only to act (US-01) with Supabase Auth (ENG-22): the sheet opens on the first action, signInWithOtp
// sends the code, verifyOtp signs in, and the action completes on its own with the Supabase access token.
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { AppState, Pressable, Text } from 'react-native';
import { getMe } from '../src/api/endpoints';
import { useAuth } from '../src/auth/AuthProvider';
import { fakeAccessToken, fakeAuth } from '../src/testing/fakeSupabase';
import { mockApi, renderApp, SIGN_IN_ROUTES, signInAs } from '../src/testing/helpers';

function VoteButton({ action }: { action: () => void }) {
  const { requireSignIn, ready, signedIn, signOut } = useAuth();
  return (
    <>
      <Pressable testID="act" accessibilityRole="button" onPress={() => requireSignIn('vote', action)}>
        <Text>{ready ? (signedIn ? 'signed-in' : 'ready') : 'loading'}</Text>
      </Pressable>
      <Pressable testID="signout" accessibilityRole="button" onPress={() => void signOut()}>
        <Text>out</Text>
      </Pressable>
    </>
  );
}

async function completeSheet(code = '482913') {
  await fireEvent.changeText(await screen.findByTestId('signin-identifier'), ' name@example.de ');
  await fireEvent.press(screen.getByTestId('signin-send'));
  await fireEvent.changeText(await screen.findByTestId('signin-code'), code);
  await fireEvent.press(screen.getByTestId('signin-confirm'));
}

beforeEach(() => jest.clearAllMocks());

test('a guest gets the sign-in sheet; after the code the action runs once with the Supabase token as Bearer', async () => {
  const calls = mockApi({ ...SIGN_IN_ROUTES, 'GET /me': { body: { id: 'a1', email: 'name@example.de', locale: 'de' } } });
  const action = jest.fn(() => void getMe());
  await renderApp(<VoteButton action={action} />);
  await screen.findByText('ready');

  await fireEvent.press(screen.getByTestId('act'));
  expect(action).not.toHaveBeenCalled();
  expect(screen.getByTestId('signin-title')).toHaveTextContent('Anmelden für Me too');

  await completeSheet();
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  expect(screen.queryByTestId('signin-sheet')).toBeNull();
  expect(await screen.findByText('signed-in')).toBeTruthy();

  expect(fakeAuth.signInWithOtp).toHaveBeenCalledWith({
    email: 'name@example.de',
    options: { shouldCreateUser: true, data: { locale: 'de' } },
  });
  expect(fakeAuth.verifyOtp).toHaveBeenCalledWith({ email: 'name@example.de', token: '482913', type: 'email' });
  await waitFor(() => expect(calls.find((c) => c.path === '/me' && c.method === 'GET')?.headers.Authorization).toBe('Bearer fresh-token'));
  // The app's language goes to the account (US-35); no request goes to the removed /auth endpoints.
  await waitFor(() => expect(calls.find((c) => c.method === 'PATCH' && c.path === '/me')?.body).toEqual({ locale: 'de' }));
  expect(calls.some((c) => c.path.startsWith('/auth'))).toBe(false);
});

test('a stored session signs in on start, and every request carries its current access token', async () => {
  const calls = mockApi({ 'GET /me': { body: { id: 'a1', email: 'name@example.de', locale: 'de' } } });
  await signInAs('stored-token');
  const action = jest.fn(() => void getMe());
  await renderApp(<VoteButton action={action} />);
  await screen.findByText('signed-in');
  await fireEvent.press(screen.getByTestId('act'));
  expect(action).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('signin-sheet')).toBeNull();
  await waitFor(() => expect(calls[0]?.headers.Authorization).toBe('Bearer stored-token'));
});

test('the old API session token is deleted from the device on start', async () => {
  mockApi({});
  await SecureStore.setItemAsync('kiezruf.session', 'old-api-token');
  await renderApp(<VoteButton action={jest.fn()} />);
  await screen.findByText('ready');
  await waitFor(async () => expect(await SecureStore.getItemAsync('kiezruf.session')).toBeNull());
});

test('a 401 from the API signs out locally and the next action asks to sign in again', async () => {
  mockApi({ 'GET /me': { status: 401, body: { error: 'unauthorized' } } });
  await signInAs('revoked-token');
  const action = jest.fn(() => void getMe().catch(() => undefined));
  await renderApp(<VoteButton action={action} />);
  await screen.findByText('signed-in');

  await fireEvent.press(screen.getByTestId('act'));
  expect(await screen.findByText('ready')).toBeTruthy();
  expect(fakeAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(fakeAccessToken()).toBeNull();

  await fireEvent.press(screen.getByTestId('act'));
  expect(screen.getByTestId('signin-sheet')).toBeTruthy();
  expect(action).toHaveBeenCalledTimes(1);
});

test('sign-out removes the push token from the API before the Supabase session ends', async () => {
  const calls = mockApi({ 'DELETE /me/push-token': { status: 204 } });
  await signInAs('test-token');
  await SecureStore.setItemAsync('kiezruf.pushToken', 'ExponentPushToken[test]');
  await renderApp(<VoteButton action={jest.fn()} />);
  await screen.findByText('signed-in');

  await fireEvent.press(screen.getByTestId('signout'));
  expect(await screen.findByText('ready')).toBeTruthy();

  const removal = calls.find((c) => c.method === 'DELETE' && c.path === '/me/push-token');
  expect(removal?.body).toEqual({ token: 'ExponentPushToken[test]' });
  expect(removal?.headers.Authorization).toBe('Bearer test-token');
  const fetchOrder = (globalThis.fetch as jest.Mock).mock.invocationCallOrder[0]!;
  expect(fakeAuth.signOut).toHaveBeenCalledTimes(1);
  expect(fakeAuth.signOut.mock.calls[0]).toEqual([]);
  expect(fakeAuth.signOut.mock.invocationCallOrder[0]).toBeGreaterThan(fetchOrder);
  expect(fakeAccessToken()).toBeNull();
  expect(await SecureStore.getItemAsync('kiezruf.pushToken')).toBeNull();
});

test('offline, sign-out still ends the session on this device', async () => {
  mockApi({});
  await signInAs('test-token');
  fakeAuth.signOut.mockResolvedValueOnce({ error: new AuthRetryableFetchError('offline', 0) });
  await renderApp(<VoteButton action={jest.fn()} />);
  await screen.findByText('signed-in');
  await fireEvent.press(screen.getByTestId('signout'));
  expect(await screen.findByText('ready')).toBeTruthy();
  expect(fakeAuth.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
  expect(fakeAccessToken()).toBeNull();
});

test('token refresh follows the app state: on in the foreground, off in the background', async () => {
  mockApi({});
  const listeners: ((state: string) => void)[] = [];
  // In jest, AppState.addEventListener is already a mock; replace its behaviour for this render only.
  jest.spyOn(AppState, 'addEventListener').mockImplementationOnce((_type, listener) => {
    listeners.push(listener as (state: string) => void);
    return { remove: jest.fn() } as never;
  });
  const initial = Object.getOwnPropertyDescriptor(AppState, 'currentState');
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  await renderApp(<VoteButton action={jest.fn()} />);
  await screen.findByText('ready');
  expect(fakeAuth.startAutoRefresh).toHaveBeenCalledTimes(1);

  await act(async () => listeners.forEach((l) => l('background')));
  expect(fakeAuth.stopAutoRefresh).toHaveBeenCalledTimes(1);
  await act(async () => listeners.forEach((l) => l('active')));
  expect(fakeAuth.startAutoRefresh).toHaveBeenCalledTimes(2);
  if (initial) Object.defineProperty(AppState, 'currentState', initial);
});

test('closing the sheet drops the pending action', async () => {
  mockApi(SIGN_IN_ROUTES);
  const action = jest.fn();
  await renderApp(<VoteButton action={action} />);
  await screen.findByText('ready');
  await fireEvent.press(screen.getByTestId('act'));
  await fireEvent.press(screen.getByTestId('signin-close'));
  expect(screen.queryByTestId('signin-sheet')).toBeNull();
  await fireEvent.press(screen.getByTestId('act'));
  await completeSheet();
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
});

test('a wrong or expired code shows the translated error and keeps the sheet open', async () => {
  mockApi(SIGN_IN_ROUTES);
  fakeAuth.verifyOtp.mockResolvedValueOnce({
    data: { user: null, session: null } as never,
    error: new AuthApiError('Token has expired or is invalid', 403, 'otp_expired'),
  });
  const action = jest.fn();
  await renderApp(<VoteButton action={action} />);
  await screen.findByText('ready');
  await fireEvent.press(screen.getByTestId('act'));
  await completeSheet('111111');
  expect(await screen.findByTestId('signin-error')).toHaveTextContent('Der Code stimmt nicht oder ist abgelaufen.', { exact: false });
  expect(screen.getByTestId('signin-sheet')).toBeTruthy();
  expect(action).not.toHaveBeenCalled();
});

test('too many code requests show a translated message and stay on the email step', async () => {
  mockApi(SIGN_IN_ROUTES);
  fakeAuth.signInWithOtp.mockResolvedValueOnce({
    data: { user: null, session: null },
    error: new AuthApiError('email rate limit exceeded', 429, 'over_email_send_rate_limit'),
  });
  await renderApp(<VoteButton action={jest.fn()} />);
  await screen.findByText('ready');
  await fireEvent.press(screen.getByTestId('act'));
  await fireEvent.changeText(screen.getByTestId('signin-identifier'), 'name@example.de');
  await fireEvent.press(screen.getByTestId('signin-send'));
  expect(await screen.findByTestId('signin-error')).toHaveTextContent('Zu viele Codes angefordert.', { exact: false });
  expect(screen.queryByTestId('signin-code')).toBeNull();
});

test('an invalid email address is caught before any request', async () => {
  const calls = mockApi(SIGN_IN_ROUTES);
  await renderApp(<VoteButton action={jest.fn()} />);
  await screen.findByText('ready');
  await fireEvent.press(screen.getByTestId('act'));
  await fireEvent.changeText(screen.getByTestId('signin-identifier'), 'not-an-email');
  await fireEvent.press(screen.getByTestId('signin-send'));
  expect(screen.getByTestId('signin-error')).toHaveTextContent('Bitte gib eine gültige E-Mail-Adresse ein.', { exact: false });
  expect(fakeAuth.signInWithOtp).not.toHaveBeenCalled();
  expect(calls).toHaveLength(0);
});
