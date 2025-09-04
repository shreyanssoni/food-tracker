package com.nourishme.app

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import org.json.JSONArray

data class TaskItem(val id: String, val title: String, val done: Boolean)

class TaskRemoteViewsService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = TaskViewsFactory(applicationContext)
}

class TaskViewsFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {

    private var items: List<TaskItem> = emptyList()

    override fun onCreate() {}

    override fun onDataSetChanged() {
        items = readTasksFromPrefs()
    }

    override fun onDestroy() {
        items = emptyList()
    }

    override fun getCount(): Int = items.size

    override fun getViewAt(position: Int): RemoteViews? {
        if (position < 0 || position >= items.size) return null
        val item = items[position]
        val rv = RemoteViews(context.packageName, R.layout.widget_task_row)
        rv.setTextViewText(R.id.task_title, item.title)
        rv.setViewVisibility(R.id.task_done, if (item.done) android.view.View.VISIBLE else android.view.View.GONE)

        // Status dot: green for active, gray for done
        val dotRes = if (item.done) R.drawable.widget_status_dot_gray else R.drawable.widget_status_dot_green
        rv.setInt(R.id.status_dot, "setBackgroundResource", dotRes)

        // Fill-in intent for toggle action
        val fillIn = Intent().apply {
            action = TaskWidgetProvider.ACTION_TOGGLE
            putExtra("task_id", item.id)
        }
        rv.setOnClickFillInIntent(R.id.row_root, fillIn)
        return rv
    }

    override fun getLoadingView(): RemoteViews? = null
    override fun getViewTypeCount(): Int = 1
    override fun getItemId(position: Int): Long = position.toLong()
    override fun hasStableIds(): Boolean = true

    private fun readTasksFromPrefs(): List<TaskItem> {
        val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        val json = prefs.getString("widget:tasks:today", "[]") ?: "[]"
        val arr = JSONArray(json)
        val out = ArrayList<TaskItem>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            out.add(TaskItem(o.optString("id"), o.optString("title"), o.optBoolean("done", false)))
        }
        return out
    }
}
