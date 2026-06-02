/**
 * settingsStorage.ts — Settings persistence via AsyncStorage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {SavedSettings, ProvisionedRadarProfile} from '../types';
import {PROVISIONED_RADARS_KEY} from '../constants';

// ── In-memory cache ──────────────────────────────────────────
const deviceSettingsCache: Record<string, SavedSettings> = {};
const AUTH_TOKEN_KEY = '@radarapp/auth-token-v1';

export async function saveSettingsForDevice(
  deviceId: string,
  settings: SavedSettings,
): Promise<void> {
  try {
    deviceSettingsCache[deviceId] = settings;
    await AsyncStorage.setItem(
      `@radarapp/settings/${deviceId}`,
      JSON.stringify(settings),
    );
  } catch (e) {
    if (__DEV__) {
      console.warn('Failed to save settings:', e);
    }
  }
}

export async function loadSettingsForDevice(
  deviceId: string,
): Promise<SavedSettings | null> {
  try {
    if (deviceSettingsCache[deviceId]) return deviceSettingsCache[deviceId];
    const raw = await AsyncStorage.getItem(`@radarapp/settings/${deviceId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      deviceSettingsCache[deviceId] = parsed;
      return parsed;
    }
    return null;
  } catch (e) {
    if (__DEV__) {
      console.warn('Failed to load settings:', e);
    }
    return null;
  }
}

// ── Provisioned radars ───────────────────────────────────────

export async function loadProvisionedRadars(): Promise<
  ProvisionedRadarProfile[]
> {
  try {
    const raw = await AsyncStorage.getItem(PROVISIONED_RADARS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item: any) =>
        item &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.lastBrokerIP === 'string',
    );
  } catch (e) {
    if (__DEV__) {
      console.warn('Failed to load provisioned radars:', e);
    }
    return [];
  }
}

export async function persistProvisionedRadars(
  profiles: ProvisionedRadarProfile[],
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      PROVISIONED_RADARS_KEY,
      JSON.stringify(profiles),
    );
  } catch (e) {
    if (__DEV__) {
      console.warn('Failed to persist provisioned radars:', e);
    }
  }
}

export function upsertProvisionedRadar(
  existing: ProvisionedRadarProfile[],
  profile: ProvisionedRadarProfile,
): ProvisionedRadarProfile[] {
  const filtered = existing.filter(item => item.id !== profile.id);
  return [profile, ...filtered].sort(
    (a, b) => b.lastProvisionedAt - a.lastProvisionedAt,
  );
}

// ── Auth token persistence ──────────────────────

export async function persistAuthToken(token: string): Promise<void> {
  await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
}

export async function loadAuthToken(): Promise<string | null> {
  const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  return token && token.trim().length > 0 ? token : null;
}

export async function clearAuthToken(): Promise<void> {
  await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
}
