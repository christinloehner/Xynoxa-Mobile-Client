package de.xynoxa.app

import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.work.Worker
import androidx.work.WorkerParameters

class XynoxaUploadWorker(appContext: Context, params: WorkerParameters) : Worker(appContext, params) {
  override fun doWork(): Result {
    return try {
      val intent = Intent(applicationContext, XynoxaAutoUploadService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        applicationContext.startForegroundService(intent)
      } else {
        applicationContext.startService(intent)
      }
      Result.success()
    } catch (err: Exception) {
      Result.retry()
    }
  }
}
