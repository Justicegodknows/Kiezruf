// Sign in only to act (US-01): the sheet opens on the first action, and the action completes on its own.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { Pressable, Text } from 'react-native';
import { getMe } from '../src/api/endpoints';
import { useAuth } from '../src/auth/AuthProvider';
import { mockApi, renderApp, SIGN_IN_ROUTES, signInAs } from '../src/testing/helpers';

function VoteButton({ action }: { action: () => void }) {
  const { requireSignIn, ready } = useAuth();
  return (
    <Pressable testID="act" accessibilityRole="button" onPress={() => requireSignIn('vote', action)}>
      <Text>{ready ? 'ready' : 'loading'}</Text>
    </Pressable>
  );
}

async function completeSheet() {
  await fireEvent.changeText(await screen.findByTestId('signin-identifier'), 'name@example.de');
  await fireEvent.press(screen.getByTestId('signin-send'));
  await fireEvent.changeText(await screen.findByTestId('signin-code'), '482913');
  await fireEvent.press(screen.getByTestId('signin-confirm'));
}

test('a guest gets the sign-in sheet; after the code the action runs once and the token is stored', async () => {
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

  expect(calls.find((c) => c.path === '/auth/code')?.body).toEqual({ email: 'name@example.de', locale: 'de' });
  expect(calls.find((c) => c.path === '/auth/verify')?.body).toEqual({ email: 'name@example.de', code: '482913', locale: 'de' });
  await waitFor(() => expect(calls.find((c) => c.path === '/me')?.headers.Authorization).toBe('Bearer fresh-token'));
  expect(await SecureStore.getItemAsync('kiezruf.session')).toBe('fresh-token');
});

test('a signed-in citizen acts at once, without the sheet', async () => {
  mockApi({});
  await signInAs();
  const action = jest.fn();
  await renderApp(<VoteButton action={action} />);
  await screen.findByText('ready');
  await fireEvent.press(screen.getByTestId('act'));
  expect(action).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('signin-sheet')).toBeNull();
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

test('a wrong code shows the translated error and keeps the sheet open', async () => {
  mockApi({ ...SIGN_IN_ROUTES, 'POST /auth/verify': { status: 400, body: { error: 'invalid_code' } } });
  const action = jest.fn();
  await renderApp(<VoteButton action={action} />);
  await screen.findByText('ready');
  await fireEvent.press(screen.getByTestId('act'));
  await completeSheet();
  expect(await screen.findByTestId('signin-error')).toHaveTextContent('Der Code stimmt nicht oder ist abgelaufen.', { exact: false });
  expect(action).not.toHaveBeenCalled();
});

test('an invalid email address is caught before any request', async () => {
  const calls = mockApi(SIGN_IN_ROUTES);
  await renderApp(<VoteButton action={jest.fn()} />);
  await screen.findByText('ready');
  await fireEvent.press(screen.getByTestId('act'));
  await fireEvent.changeText(screen.getByTestId('signin-identifier'), 'not-an-email');
  await fireEvent.press(screen.getByTestId('signin-send'));
  expect(screen.getByTestId('signin-error')).toHaveTextContent('Bitte gib eine gültige E-Mail-Adresse ein.', { exact: false });
  expect(calls).toHaveLength(0);
});
