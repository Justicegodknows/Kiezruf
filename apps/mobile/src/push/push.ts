// Push registration (US-29). After sign-in the app asks for notification permission and registers the Expo
// push token with the API; sign-out removes it from the API before the Supabase session ends. Payloads are generic and carry only the report ID (README).
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { registerPushToken, removePushToken } from '../api/endpoints';
import { easProjectId } from '../config';

const PUSH_TOKEN_KEY = 'kiezruf.pushToken';

export type PushStatus = 'registered' | 'no_project_id' | 'denied' | 'unsupported' | 'error';

export async function registerForPush(): Promise<PushStatus> {
  if ((Platform.OS !== 'ios' && Platform.OS !== 'android') || !Device.isDevice) return 'unsupported';
  // Expo push tokens need an EAS project ID. None is set up yet; skip quietly until app.json has extra.eas.projectId.
  const projectId = easProjectId();
  if (!projectId) return 'no_project_id';
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Kiezruf',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return 'denied';
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await registerPushToken(token, Platform.OS);
    await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
    return 'registered';
  } catch {
    return 'error';
  }
}

/** Removes this device's token from the API (while the session is still valid) and from the device. */
export async function unregisterPush(): Promise<void> {
  let token: string | null = null;
  try {
    token = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
    if (token) await removePushToken(token);
  } catch {
    // The token dies with the session or the account anyway.
  } finally {
    if (token) await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY).catch(() => undefined);
  }
}

/** Forgets this device's token locally only, when the session or the account is already gone. */
export async function forgetPushToken(): Promise<void> {
  await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY).catch(() => undefined);
}

/** The report ID in a notification's data, if it carries a valid one. */
export function publicIdFromNotification(data: unknown, pattern: RegExp): string | null {
  const id = (data as { publicId?: unknown } | null | undefined)?.publicId;
  return typeof id === 'string' && pattern.test(id) ? id : null;
}
