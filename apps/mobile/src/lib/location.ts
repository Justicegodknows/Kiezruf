// Location only at the moment of an action, in the foreground (US-03, US-32). This module never asks for
// background permission and never watches the position.
import * as Location from 'expo-location';
import { AppError } from '../api/errors';
import type { DeviceFix } from '../report/onsite';

/** Asks for foreground permission if needed, then takes one high-accuracy fix. */
export async function currentFix(): Promise<DeviceFix> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new AppError('location_denied');
  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const { latitude, longitude, accuracy } = position.coords;
    return { lat: latitude, lon: longitude, accuracyM: accuracy ?? null };
  } catch {
    throw new AppError('location_unavailable');
  }
}

/** Like currentFix, but null instead of an error when location is denied or unavailable (gallery check). */
export async function currentFixOrNull(): Promise<DeviceFix | null> {
  try {
    return await currentFix();
  } catch {
    return null;
  }
}
