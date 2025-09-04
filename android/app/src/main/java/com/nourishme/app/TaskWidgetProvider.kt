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

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        android.util.Log.d("TaskWidget", "Widget enabled")
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        android.util.Log.d("TaskWidget", "Widget disabled")
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        // Ensure periodic refresh is scheduled
        schedulePeriodicRefresh(context)
        android.util.Log.d("TaskWidget", "onUpdate called with ${appWidgetIds.size} widgets")
        for (widgetId in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.widget_task)

            // Read tasks from shared prefs
            val (top, remaining) = readTopAndRemaining(context)
            android.util.Log.d("TaskWidget", "Read tasks: top='$top', remaining=$remaining")
            views.setTextViewText(R.id.top_task, top ?: "No tasks for today")
            val remainingText = if (remaining > 0) "$remaining left" else "All caught up"
            views.setTextViewText(R.id.remaining_text, remainingText)

            // Wire list view with RemoteViewsService
            val svcIntent = Intent(context, TaskRemoteViewsService::class.java).apply {
                data = Uri.parse(this.toUri(Intent.URI_INTENT_SCHEME))
            }
            views.setRemoteAdapter(R.id.list_view, svcIntent)

            // Row clicks should open the tasks screen
            val openTasksIntent = Intent(Intent.ACTION_VIEW, Uri.parse("nourishme://app/tasks"))
            val openTasksPending = PendingIntent.getActivity(
                context, 0, openTasksIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            views.setPendingIntentTemplate(R.id.list_view, openTasksPending)

            // Open tasks screen
            val addIntent = Intent(Intent.ACTION_VIEW, Uri.parse("nourishme://app/tasks"))
            val addPending = PendingIntent.getActivity(
                context, 0, addIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            views.setOnClickPendingIntent(R.id.btn_add, addPending)
            // New "+ Tasks" button inside the list container
            views.setOnClickPendingIntent(R.id.btn_add_list, addPending)
            // Also allow tapping header to open tasks
            views.setOnClickPendingIntent(R.id.header, addPending)

            // Refresh action
            val refreshIntent = Intent(context, TaskWidgetProvider::class.java).apply { action = ACTION_REFRESH }
            val refreshPending = PendingIntent.getBroadcast(
                context, 0, refreshIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            views.setOnClickPendingIntent(R.id.title, refreshPending)
            views.setOnClickPendingIntent(R.id.btn_refresh, refreshPending)

            // Compact: tapping top task also opens tasks screen
            views.setOnClickPendingIntent(R.id.top_task, openTasksPending)

            // Adjust compact vs list visibility based on size
            applySizeMode(context, appWidgetManager, widgetId, views)

            appWidgetManager.updateAppWidget(widgetId, views)
            appWidgetManager.notifyAppWidgetViewDataChanged(widgetId, R.id.list_view)
            android.util.Log.d("TaskWidget", "Widget $widgetId updated")
        }
    }

    override fun onAppWidgetOptionsChanged(context: Context?, appWidgetManager: AppWidgetManager?, appWidgetId: Int, newOptions: android.os.Bundle?) {
        super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
        if (context != null && appWidgetManager != null) {
            val views = RemoteViews(context.packageName, R.layout.widget_task)
            applySizeMode(context, appWidgetManager, appWidgetId, views)
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }

    override fun onReceive(context: Context?, intent: Intent?) {
        super.onReceive(context, intent)
        android.util.Log.d("TaskWidget", "onReceive: action=${intent?.action}")
        if (context != null) {
            when (intent?.action) {
                ACTION_REFRESH -> {
                    android.util.Log.d("TaskWidget", "Refreshing widgets")
                    val mgr = AppWidgetManager.getInstance(context)
                    val cn = ComponentName(context, TaskWidgetProvider::class.java)
                    val ids = mgr.getAppWidgetIds(cn)
                    onUpdate(context, mgr, ids)
                }
                ACTION_TOGGLE -> {
                    val id = intent.getStringExtra("task_id")
                    if (!id.isNullOrEmpty()) {
                        toggleTaskDone(context, id)
                        val mgr = AppWidgetManager.getInstance(context)
                        val cn = ComponentName(context, TaskWidgetProvider::class.java)
                        val ids = mgr.getAppWidgetIds(cn)
                        onUpdate(context, mgr, ids)
                    }
                }
            }
        }
    }

    companion object {
        const val ACTION_REFRESH = "com.nourishme.app.REFRESH_WIDGET"
        const val ACTION_TOGGLE = "com.nourishme.app.TOGGLE_TASK"
        fun requestRefresh(context: Context) {
            val intent = Intent(context, TaskWidgetProvider::class.java).apply { action = ACTION_REFRESH }
            context.sendBroadcast(intent)
        }
    }

    private fun readTopAndRemaining(context: Context): Pair<String?, Int> {
        val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        val json = prefs.getString("widget:tasks:today", "[]") ?: "[]"
        android.util.Log.d("TaskWidget", "Read JSON from prefs: $json")
        val arr = JSONArray(json)
        if (arr.length() == 0) return Pair(null, 0)
        var remaining = 0
        var top: String? = null
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            val done = o.optBoolean("done", false)
            if (!done) remaining++
            if (top == null) top = o.optString("title", "")
        }
        android.util.Log.d("TaskWidget", "Parsed: top='$top', remaining=$remaining")
        return Pair(top, remaining.coerceAtLeast(0))
    }

    // Returns the id of the first incomplete task to support compact toggle on tapping the top task
    private fun readTopId(context: Context): String? {
        val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        val json = prefs.getString("widget:tasks:today", "[]") ?: "[]"
        val arr = JSONArray(json)
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            val done = o.optBoolean("done", false)
            if (!done) {
                val id = o.optString("id", "")
                if (id.isNotEmpty()) return id
            }
        }
        return null
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

    private fun toggleTaskDone(context: Context, taskId: String) {
        val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        val json = prefs.getString("widget:tasks:today", "[]") ?: "[]"
        val arr = JSONArray(json)
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            if (o.optString("id") == taskId) {
                o.put("done", !o.optBoolean("done", false))
                break
            }
        }
        prefs.edit().putString("widget:tasks:today", arr.toString()).apply()
    }

    private fun applySizeMode(context: Context, appWidgetManager: AppWidgetManager, widgetId: Int, views: RemoteViews) {
        val opts = appWidgetManager.getAppWidgetOptions(widgetId)
        val minHeight = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT)
        val minWidth = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)
        val useList = minHeight >= 140 || minWidth >= 260
        views.setViewVisibility(R.id.list_container, if (useList) android.view.View.VISIBLE else android.view.View.GONE)
        views.setViewVisibility(R.id.compact_container, if (useList) android.view.View.GONE else android.view.View.VISIBLE)
    }
}
