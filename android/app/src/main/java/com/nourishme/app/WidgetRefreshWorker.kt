package com.nourishme.app

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class WidgetRefreshWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        try {
            TaskWidgetProvider.requestRefresh(applicationContext)
        } catch (_: Throwable) {
            // ignore
        }
        return Result.success()
    }
    companion object {
        const val UNIQUE_TAG = "nourish_widget_periodic_refresh"
    }
}
