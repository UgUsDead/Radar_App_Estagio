/**
 * Push Notification Service — FCM integration for fall alerts.
 *
 * Handles:
 * - FCM permission request (Android 13+)
 * - Device token retrieval and registration with backend
 * - Token refresh handling
 * - Foreground message display
 */

import messaging, { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import { Platform, PermissionsAndroid, Alert } from 'react-native';
import { normalizeBase } from '../api/backend';
import { loadAuthToken } from './settingsStorage';
import { clearAllNotifications, clearNotificationsByTag } from './notificationCleaner';

/**
 * Request notification permissions (required on Android 13+).
 * Returns true if granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  // Android 13+ (API 33) requires runtime permission
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (result !== PermissionsAndroid.RESULTS.GRANTED) {
      console.log('[Push] POST_NOTIFICATIONS permission denied');
      return false;
    }
  }

  // Firebase-level permission request
  const authStatus = await messaging().requestPermission();
  const granted =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  console.log('[Push] Permission status:', authStatus, 'granted:', granted);
  return granted;
}

/**
 * Get the FCM device token and register it with the backend.
 */
async function registerDeviceToken(apiBase: string, tokenOverride?: string): Promise<boolean> {
  try {
    const authToken = await loadAuthToken();
    if (!authToken) {
      console.warn('[Push] Missing auth token, skipping registration');
      return false;
    }
    const token = tokenOverride || await messaging().getToken();
    if (!token) {
      console.warn('[Push] Failed to get FCM token');
      return false;
    }

    console.log('[Push] FCM token obtained:', token.substring(0, 20) + '...');

    // Register with backend
    const base = normalizeBase(apiBase);
    const res = await fetch(`${base}/push/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        token,
        deviceId: `android-${Platform.Version}`,
        label: 'RadarApp Mobile',
      }),
    });

    if (!res.ok) {
      console.warn('[Push] Backend token registration failed:', res.status);
      return false;
    }

    console.log('[Push] Token registered with backend');
    return true;
  } catch (err: any) {
    console.warn('[Push] Token registration error:', err?.message || err);
    return false;
  }
}

function createTokenRegistrationScheduler(apiBase: string): {
  run: (tokenOverride?: string) => Promise<void>;
  stop: () => void;
} {
  let cancelled = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  const stop = () => {
    cancelled = true;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const run = async (tokenOverride?: string) => {
    if (cancelled) return;
    const ok = await registerDeviceToken(apiBase, tokenOverride);
    if (ok) {
      attempt = 0;
      return;
    }

    attempt += 1;
    const delayMs = Math.min(30_000 * attempt, 5 * 60_000);
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      void run();
    }, delayMs);
  };

  return { run, stop };
}

/**
 * Listen for token refreshes and re-register with backend.
 */
export function onTokenRefresh(
  apiBase: string,
  onRetry?: (tokenOverride?: string) => void,
): () => void {
  return messaging().onTokenRefresh(async (newToken) => {
    console.log('[Push] Token refreshed, re-registering...');
    const ok = await registerDeviceToken(apiBase, newToken);
    if (!ok && onRetry) {
      onRetry(newToken);
    }
  });
}

/**
 * Handle foreground FCM messages — show an in-app alert.
 * Returns unsubscribe function.
 */
export function onForegroundMessage(
  onAlert?: (type: string, message: string, radarId?: string, roomId?: number) => void,
): () => void {
  return messaging().onMessage(async (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
    console.log('[Push] Foreground message:', remoteMessage.notification?.title);

    const dataType = remoteMessage.data?.type;
    if (dataType === 'clear') {
      const roomIdRaw = remoteMessage.data?.room_id;
      const radarId = remoteMessage.data?.radar_id;
      const roomIdParsed = roomIdRaw === undefined || roomIdRaw === null || roomIdRaw === ''
        ? undefined
        : Number(roomIdRaw);
      const roomId = Number.isFinite(roomIdParsed) ? roomIdParsed : undefined;

      if (roomId !== undefined) {
        clearNotificationsByTag(`room-${roomId}`);
      } else if (radarId) {
        clearNotificationsByTag(`radar-${radarId}`);
      } else {
        clearAllNotifications();
      }
      return;
    }

    const title = remoteMessage.notification?.title || 'Alerta';
    const body = remoteMessage.notification?.body || '';
    const radarId = remoteMessage.data?.radar_id;
    const roomIdRaw = remoteMessage.data?.room_id;
    const roomIdParsed = roomIdRaw === undefined || roomIdRaw === null || roomIdRaw === ''
      ? undefined
      : Number(roomIdRaw);
    const roomId = Number.isFinite(roomIdParsed) ? roomIdParsed : undefined;

    if (onAlert) {
      onAlert('fall', `${title}: ${body}`, radarId, roomId);
    } else {
      Alert.alert(title, body);
    }
  });
}

/**
 * Handle notification interaction — when user taps a notification.
 */
export function onNotificationOpened(
  onOpen?: (radarId: string) => void,
): () => void {
  return messaging().onNotificationOpenedApp((remoteMessage) => {
    console.log('[Push] Notification opened app:', remoteMessage.data?.radar_id);
    const radarId = remoteMessage.data?.radar_id;
    if (radarId && onOpen) {
      onOpen(radarId);
    }
  });
}

/**
 * Handle initial notification — when app is opened from a dead state by tapping a notification.
 */
export async function handleInitialNotification(
  onOpen?: (radarId: string) => void,
): Promise<void> {
  const remoteMessage = await messaging().getInitialNotification();
  if (remoteMessage) {
    console.log('[Push] App opened from initial notification:', remoteMessage.data?.radar_id);
    const radarId = remoteMessage.data?.radar_id;
    if (radarId && onOpen) {
      onOpen(radarId);
    }
  }
}

/**
 * Full initialization — call once on app startup.
 */
export async function initializePushNotifications(
  apiBase: string,
  onAlert?: (type: string, message: string, radarId?: string, roomId?: number) => void,
  onOpen?: (radarId: string) => void,
): Promise<{
  unsubscribeRefresh: () => void;
  unsubscribeForeground: () => void;
  unsubscribeOpened: () => void;
  stopRegisterRetry: () => void;
} | null> {
  // Always process initial notification for cold-starts, even if permissions
  // are not granted yet (the tap already happened).
  handleInitialNotification(onOpen).catch(err => {
    console.warn('[Push] Error handling initial notification:', err);
  });

  const granted = await requestNotificationPermission();
  if (!granted) {
    console.log('[Push] Notifications not permitted, skipping registration');
    return null;
  }

  const tokenRegistrar = createTokenRegistrationScheduler(apiBase);
  await tokenRegistrar.run();
  const unsubscribeRefresh = onTokenRefresh(apiBase, tokenRegistrar.run);
  const unsubscribeForeground = onForegroundMessage(onAlert);
  const unsubscribeOpened = onNotificationOpened(onOpen);

  return { unsubscribeRefresh, unsubscribeForeground, unsubscribeOpened, stopRegisterRetry: tokenRegistrar.stop };
}
