import { NativeModules, Platform } from 'react-native';

const moduleName = 'NotificationUtils';

const notificationModule: {
  clearAll?: () => void;
  clearByTag?: (tag: string) => void;
} | null = Platform.OS === 'android' ? (NativeModules as any)[moduleName] : null;

export function clearAllNotifications(): void {
  if (!notificationModule?.clearAll) return;
  notificationModule.clearAll();
}

export function clearNotificationsByTag(tag: string): void {
  if (!notificationModule?.clearByTag) return;
  notificationModule.clearByTag(tag);
}
