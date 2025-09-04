package com.nourishme.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.util.Log
import android.widget.RemoteViews

class QuickActionsWidgetProvider : AppWidgetProvider() {
    companion object {
        private const val TAG = "QuickActionsWidget"
        const val ACTION_OPEN_ADD_TASK = "com.nourishme.app.widget.OPEN_ADD_TASK"
        const val ACTION_OPEN_ADD_FOOD = "com.nourishme.app.widget.OPEN_ADD_FOOD"
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        for (id in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, id)
        }
    }

    private fun isDarkMode(context: Context): Boolean {
        val mode = context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
        return mode == Configuration.UI_MODE_NIGHT_YES
    }

    private fun updateAppWidget(context: Context, manager: AppWidgetManager, widgetId: Int) {
        // Use medium by default; host will resize as needed. Small uses different layout when width is tiny
        val options = manager.getAppWidgetOptions(widgetId)
        val minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)
        val layoutId = if (minWidth < 110) R.layout.widget_quick_add_small else R.layout.widget_quick_add_medium

        val views = RemoteViews(context.packageName, layoutId)

        // Background swap based on theme
        val bg = if (isDarkMode(context)) R.drawable.glass_bg_dark else R.drawable.glass_bg_light
        views.setInt(R.id.widget_root, "setBackgroundResource", bg)

        // Button background gradients by theme
        val gradPrimary = if (isDarkMode(context)) R.drawable.btn_grad_emerald_teal else R.drawable.btn_grad_indigo_blue
        views.setInt(R.id.btn_task, "setBackgroundResource", gradPrimary)
        if (layoutId == R.layout.widget_quick_add_medium) {
            views.setInt(R.id.btn_food, "setBackgroundResource", gradPrimary)
        }

        // Click intents route via broadcast so we can log, then open deep link
        views.setOnClickPendingIntent(R.id.btn_task, getPendingIntent(context, ACTION_OPEN_ADD_TASK))
        if (layoutId == R.layout.widget_quick_add_medium) {
            views.setOnClickPendingIntent(R.id.btn_food, getPendingIntent(context, ACTION_OPEN_ADD_FOOD))
        }

        manager.updateAppWidget(widgetId, views)
    }

    private fun getPendingIntent(context: Context, action: String): PendingIntent {
        val intent = Intent(context, QuickActionsWidgetProvider::class.java).apply { this.action = action }
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE else PendingIntent.FLAG_UPDATE_CURRENT
        return PendingIntent.getBroadcast(context, action.hashCode(), intent, flags)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        when (intent.action) {
            ACTION_OPEN_ADD_TASK -> {
                Log.i(TAG, "widget_open_add_task")
                openDeepLink(context, "nourishme://app/add-task")
            }
            ACTION_OPEN_ADD_FOOD -> {
                Log.i(TAG, "widget_open_add_food")
                openDeepLink(context, "nourishme://app/add-food")
            }
            AppWidgetManager.ACTION_APPWIDGET_UPDATE -> {
                // Refresh all
                val mgr = AppWidgetManager.getInstance(context)
                val ids = mgr.getAppWidgetIds(ComponentName(context, QuickActionsWidgetProvider::class.java))
                onUpdate(context, mgr, ids)
            }
            Intent.ACTION_CONFIGURATION_CHANGED -> {
                // Theme changed: update all instances to swap backgrounds/gradients
                val mgr = AppWidgetManager.getInstance(context)
                val ids = mgr.getAppWidgetIds(ComponentName(context, QuickActionsWidgetProvider::class.java))
                onUpdate(context, mgr, ids)
            }
        }
    }

    private fun openDeepLink(context: Context, url: String) {
        val i = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        try {
            context.startActivity(i)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open deep link: $url", e)
            // Fallback: open main activity
            val fallback = Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            context.startActivity(fallback)
        }
    }
}
