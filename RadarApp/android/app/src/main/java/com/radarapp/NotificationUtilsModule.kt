package com.radarapp

import android.app.NotificationManager
import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class NotificationUtilsModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "NotificationUtils"

  @ReactMethod
  fun clearAll() {
    val manager = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.cancelAll()
  }

  @ReactMethod
  fun clearByTag(tag: String) {
    val manager = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val activeNotifications = manager.activeNotifications
    for (notification in activeNotifications) {
      if (notification.tag == tag) {
        manager.cancel(notification.tag, notification.id)
      }
    }
  }
}
