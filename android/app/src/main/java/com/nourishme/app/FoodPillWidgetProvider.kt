package com.nourishme.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.widget.RemoteViews

class FoodPillWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        for (id in appWidgetIds) updateAppWidget(context, appWidgetManager, id)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        when (intent.action) {
            Intent.ACTION_CONFIGURATION_CHANGED, AppWidgetManager.ACTION_APPWIDGET_UPDATE -> {
                val mgr = AppWidgetManager.getInstance(context)
                val ids = mgr.getAppWidgetIds(ComponentName(context, FoodPillWidgetProvider::class.java))
                onUpdate(context, mgr, ids)
            }
        }
    }

    private fun isDarkMode(context: Context): Boolean {
        val mode = context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
        return mode == Configuration.UI_MODE_NIGHT_YES
    }

    private fun updateAppWidget(context: Context, manager: AppWidgetManager, widgetId: Int) {
        val views = RemoteViews(context.packageName, R.layout.widget_food_pill)
        // swap backgrounds by theme
        val bg = if (isDarkMode(context)) R.drawable.glass_bg_dark else R.drawable.glass_bg_light
        val gradPrimary = if (isDarkMode(context)) R.drawable.btn_grad_emerald_teal else R.drawable.btn_grad_indigo_blue
        views.setInt(R.id.widget_root, "setBackgroundResource", bg)
        views.setInt(R.id.btn_food_pill, "setBackgroundResource", gradPrimary)

        // click: open /food
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("nourishme://app/food"))
        val pending = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        views.setOnClickPendingIntent(R.id.btn_food_pill, pending)

        manager.updateAppWidget(widgetId, views)
    }
}
