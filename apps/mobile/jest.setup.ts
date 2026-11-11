// Jest mocks for native modules. Each test can override the jest.fn() behaviour it cares about.
/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// German is the default (US-35): the test device reports a German locale.
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'de', languageTag: 'de-DE' }],
}));

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});

jest.mock('expo-router', () => {
  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
    dismissTo: jest.fn(),
  };
  const Stack = ({ children }: { children?: unknown }) => children ?? null;
  Stack.Screen = () => null;
  return { router, useRouter: () => router, useLocalSearchParams: jest.fn(() => ({})), Stack };
});

jest.mock('@maplibre/maplibre-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Map = ({ children, ...props }: { children?: unknown }) => React.createElement(View, { ...props, testID: 'maplibre-map' }, children);
  const Camera = React.forwardRef((_props: unknown, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ flyTo: jest.fn(), easeTo: jest.fn(), jumpTo: jest.fn() }));
    return null;
  });
  const Marker = ({ children }: { children?: unknown }) => React.createElement(View, null, children);
  return { Map, Camera, Marker };
});

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const takePictureAsync = jest.fn(async () => ({ uri: 'file:///photo.jpg', width: 4032, height: 3024 }));
  const CameraView = React.forwardRef((props: object, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ takePictureAsync }));
    return React.createElement(View, props);
  });
  const permission = { granted: true, canAskAgain: true, status: 'granted' };
  return { CameraView, useCameraPermissions: jest.fn(() => [permission, jest.fn()]), __takePictureAsync: takePictureAsync };
});

jest.mock('expo-location', () => ({
  Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  // Karl-Marx-Straße 100, Neukölln, 12 m accuracy.
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 52.4795, longitude: 13.4365, accuracy: 12 } })),
}));

jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })) }));

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
  ImageManipulator: {
    manipulate: jest.fn(() => {
      const context: { resize: jest.Mock; renderAsync: jest.Mock } = {
        resize: jest.fn((): unknown => context),
        renderAsync: jest.fn(async () => ({ saveAsync: jest.fn(async () => ({ uri: 'file:///resized.jpg', width: 2048, height: 1536 })) })),
      };
      return context;
    }),
  },
}));

jest.mock('expo-device', () => ({ isDevice: true }));

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  getExpoPushTokenAsync: jest.fn(async () => ({ type: 'expo', data: 'ExponentPushToken[test]' })),
  useLastNotificationResponse: jest.fn(() => null),
}));

beforeEach(() => {
  (require('expo-secure-store').__store as Map<string, string>).clear();
});
