// jest-expo picks up files in __tests__ ending in -test.tsx (Expo SDK 58 unit-testing guide).
// In @testing-library/react-native 14, render is async.
import { render } from '@testing-library/react-native';

import App from '../App';

describe('<App />', () => {
  test('renders the start screen', async () => {
    const { getByText } = await render(<App />);
    getByText('Open up App.tsx to start working on your app!');
  });
});

// Screen tests from the product plan. Each becomes real with its screen (they follow the prototype's "Citizen app" tab).
describe('citizen app screens', () => {
  test.todo('map: shows the tenant name and no score or level on any card (US-15, US-24)');
  test.todo('report detail: Me too opens sign-in for a guest, then counts the vote (US-01, US-18)');
  test.todo('new report: pre-selects the AI category only at 0.80 confidence or more (US-14)');
  test.todo('new report: the danger toggle shows the 112 / 110 banner (US-09)');
  test.todo('new report: names the receiving office before posting (US-41)');
  test.todo('not live here yet: offers "Tell me when it starts here" (US-44)');
  test.todo('account: language switch between Deutsch and English (US-35)');
  test.todo('account: delete my account asks for confirmation (US-34)');
});
