package de.xynoxa.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.content.pm.ServiceInfo
import androidx.core.app.NotificationCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.bridge.Arguments

class XynoxaAutoUploadService : HeadlessJsTaskService() {
  override fun onCreate() {
    super.onCreate()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(1, createNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(1, createNotification())
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    super.onStartCommand(intent, flags, startId)
    return START_STICKY
  }

  override fun getTaskConfig(intent: android.content.Intent?): HeadlessJsTaskConfig {
    return HeadlessJsTaskConfig(
      "XynoxaAutoUpload",
      Arguments.createMap(),
      15 * 60 * 1000L,
      true
    )
  }

  private fun createNotification(): Notification {
    val channelId = "xynoxa_autoupload"
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        channelId,
        "Xynoxa Auto-Upload",
        NotificationManager.IMPORTANCE_LOW
      )
      manager.createNotificationChannel(channel)
    }

    return NotificationCompat.Builder(this, channelId)
      .setContentTitle("Xynoxa Auto-Upload")
      .setContentText("Fotos werden im Hintergrund synchronisiert.")
      .setSmallIcon(R.mipmap.ic_launcher)
      .setOngoing(true)
      .build()
  }
}
