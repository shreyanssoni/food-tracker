package com.nourishme.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import org.json.JSONArray
import java.util.concurrent.TimeUnit

class TaskWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        // Ensure periodic refresh is scheduled
        schedulePeriodicRefresh(context)
        for (widgetId in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.widget_task)

            // Read tasks from shared prefs
            val (top, remaining) = readTopAndRemaining(context)
            views.setTextViewText(R.id.top_task, top ?: "No tasks for today")
            val remainingText = if (remaining > 0) "$remaining remaining" else "All caught up"
            views.setTextViewText(R.id.remaining_text, remainingText)

            // Add Task deep link: nourishme://app/tasks?action=new or https fallback
            val addIntent = Intent(Intent.ACTION_VIEW, Uri.parse("nourishme://app/tasks?action=new"))
            val addPending = PendingIntent.getActivity(
                context, 0, addIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            views.setOnClickPendingIntent(R.id.btn_add, addPending)

            // Tap title to refresh the widget list immediately
            val refreshIntent = Intent(context, TaskWidgetProvider::class.java).apply { action = ACTION_REFRESH }
            val refreshPending = PendingIntent.getBroadcast(
                context, 0, refreshIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            views.setOnClickPendingIntent(R.id.title, refreshPending)
            views.setOnClickPendingIntent(R.id.btn_refresh, refreshPending)

            appWidgetManager.updateAppWidget(widgetId, views)
        }
    }

    override fun onReceive(context: Context?, intent: Intent?) {
        super.onReceive(context, intent)
        if (context != null && intent?.action == ACTION_REFRESH) {
            val mgr = AppWidgetManager.getInstance(context)
            val cn = ComponentName(context, TaskWidgetProvider::class.java)
            val ids = mgr.getAppWidgetIds(cn)
            onUpdate(context, mgr, ids)
        }
    }

    companion object {
        const val ACTION_REFRESH = "com.nourishme.app.REFRESH_WIDGET"
        fun requestRefresh(context: Context) {
            val intent = Intent(context, TaskWidgetProvider::class.java).apply { action = ACTION_REFRESH }
            context.sendBroadcast(intent)
        }
    }

    private fun readTopAndRemaining(context: Context): Pair<String?, Int> {
        val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        val json = prefs.getString("widget:tasks:today", "[]") ?: "[]"
        val arr = JSONArray(json)
        if (arr.length() == 0) return Pair(null, 0)
        var remaining = 0
        var top: String? = null
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            val done = o.optBoolean("done", false)
            if (!done) remaining++
            if (top == null) top = o.optString("title", null)
        }
        return Pair(top, remaining.coerceAtLeast(0))
    }

    private fun schedulePeriodicRefresh(context: Context) {
        val work = PeriodicWorkRequestBuilder<WidgetRefreshWorker>(30, TimeUnit.MINUTES)
            .addTag(WidgetRefreshWorker.UNIQUE_TAG)
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WidgetRefreshWorker.UNIQUE_TAG,
            ExistingPeriodicWorkPolicy.KEEP,
            work
        )
    }
}
