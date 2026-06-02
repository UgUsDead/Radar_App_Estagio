/**
 * @format
 */

// Buffer polyfill for protocol handling
import {Buffer} from 'buffer';
global.Buffer = Buffer;

import {AppRegistry} from 'react-native';
import messaging from '@react-native-firebase/messaging';
import App from './App';
import {name as appName} from './app.json';
import {clearAllNotifications, clearNotificationsByTag} from './src/services/notificationCleaner';

// Register FCM background message handler (must be at entry point)
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('[Push] Background message:', remoteMessage.notification?.title);
  const data = remoteMessage.data || {};
  if (data.type === 'clear') {
    const roomIdRaw = data.room_id;
    const radarId = data.radar_id;
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
  // Android will automatically display the notification in the system tray
  // when the message contains a 'notification' payload
});

AppRegistry.registerComponent(appName, () => App);
