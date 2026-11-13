// Citizen app screens, rendered through the real routes in src/app (Expo Router testing library).
// In @testing-library/react-native 14 and expo-router 58, rendering and navigation are async.
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import i18n from '@/i18n';

async function openApp(initialUrl = '/') {
  await renderRouter('src/app', { initialUrl });
}

beforeEach(async () => {
  await act(() => i18n.changeLanguage('de'));
});

describe('home', () => {
  test('shows the headline and the newest reports as street-name plates', async () => {
    await openApp();
    expect(screen.getByText('Dein Kiez.\nDeine Stimme.')).toBeOnTheScreen();
    expect(screen.getByText('Gerade gemeldet')).toBeOnTheScreen();
    expect(screen.getByText('Karl-Marx-Straße')).toBeOnTheScreen();
  });

  test('map: never shows a score or level on any card (US-15, US-24)', async () => {
    await openApp();
    for (const word of ['Kritisch', 'Critical', 'Hoch', 'Prioritätswert', '97,1']) {
      expect(screen.queryByText(word)).toBeNull();
    }
  });

  test('filters nearby reports by category', async () => {
    await openApp();
    expect(screen.getByText('6 Meldungen')).toBeOnTheScreen();
    await act(() => fireEvent.press(screen.getByRole('radio', { name: 'Öffentliche Einrichtung' })));
    expect(screen.getByText('3 Meldungen')).toBeOnTheScreen();
  });

  test('account: language switch between Deutsch and English (US-35)', async () => {
    await openApp();
    await act(() => fireEvent.press(screen.getByRole('radio', { name: 'English' })));
    expect(await screen.findByText('Your Kiez.\nYour voice.')).toBeOnTheScreen();
    await act(() => fireEvent.press(screen.getByRole('radio', { name: 'Deutsch' })));
    expect(await screen.findByText('Dein Kiez.\nDeine Stimme.')).toBeOnTheScreen();
  });

  test('switches between light and dark theme', async () => {
    await openApp();
    const before = screen.getByRole('button', { name: /Design aktivieren/ }).props.accessibilityLabel;
    await act(() => fireEvent.press(screen.getByRole('button', { name: before })));
    const after = screen.getByRole('button', { name: /Design aktivieren/ }).props.accessibilityLabel;
    expect(after).not.toBe(before);
  });
});

describe('report detail', () => {
  test('Me too counts the vote and a second tap takes it back (US-18)', async () => {
    await openApp('/reports/BE-NK-2026-0112');
    expect(screen.getByText('Fußgängerampel ausgefallen')).toBeOnTheScreen();
    expect(screen.getByText('20 Nachbarn betroffen')).toBeOnTheScreen();
    await act(() => fireEvent.press(screen.getByRole('button', { name: /Ich auch/ })));
    expect(screen.getByText('21 Nachbarn betroffen')).toBeOnTheScreen();
    await act(() => fireEvent.press(screen.getByRole('button', { name: /unterstützt/ })));
    expect(screen.getByText('20 Nachbarn betroffen')).toBeOnTheScreen();
  });

  test('says so when a report does not exist', async () => {
    await openApp('/reports/BE-NK-0000-0000');
    expect(screen.getByText('Diese Meldung gibt es nicht.')).toBeOnTheScreen();
  });
});

// Screen tests from the product plan that wait for their screens (prototype "Citizen app" tab).
describe('citizen app screens still to build', () => {
  test.todo('report detail: Me too opens sign-in for a guest, then counts the vote (US-01, US-18)');
  test.todo('new report: pre-selects the AI category only at 0.80 confidence or more (US-14)');
  test.todo('new report: the danger toggle shows the 112 / 110 banner (US-09)');
  test.todo('new report: names the receiving office before posting (US-41)');
  test.todo('not live here yet: offers "Tell me when it starts here" (US-44)');
  test.todo('account: delete my account asks for confirmation (US-34)');
});
