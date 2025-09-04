package com.nourishme.app

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import org.json.JSONArray

data class TaskItem(val id: String, val title: String, val done: Boolean)

class TaskRemoteViewsService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        android.util.Log.d("TaskRV", "onGetViewFactory called: $intent")
        return TaskViewsFactory(applicationContext)
    }
}

class TaskViewsFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {

    private var items: List<TaskItem> = emptyList()
    private var loading: Boolean = false
    private val placeholderCount = 3

    override fun onCreate() {
        android.util.Log.d("TaskRV", "onCreate")
    }

    override fun onDataSetChanged() {
        android.util.Log.d("TaskRV", "onDataSetChanged: reading tasks")
        try {
            val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            val until = prefs.getLong("widget:tasks:loading_until", 0L)
            loading = System.currentTimeMillis() < until
            items = readTasksFromPrefs()
            android.util.Log.d("TaskRV", "Loaded ${items.size} items, loading=$loading")
            // If we already have items, stop showing loading regardless of flag
            if (items.isNotEmpty()) loading = false
        } catch (t: Throwable) {
            android.util.Log.e("TaskRV", "onDataSetChanged error", t)
            items = emptyList()
        }
    }

    override fun onDestroy() {
        android.util.Log.d("TaskRV", "onDestroy")
        items = emptyList()
    }

    override fun getCount(): Int {
        val c = if (loading && items.isEmpty()) placeholderCount else items.size
        android.util.Log.d("TaskRV", "getCount=$c")
        return c
    }

    override fun getViewAt(position: Int): RemoteViews? {
        return try {
            if (loading && items.isEmpty()) {
                // Render skeleton row
                if (position < 0 || position >= placeholderCount) {
                    android.util.Log.w("TaskRV", "getViewAt skeleton out of bounds: pos=$position size=$placeholderCount")
                    null
                } else {
                    android.util.Log.d("TaskRV", "getViewAt skeleton pos=$position")
                    RemoteViews(context.packageName, R.layout.widget_task_row_skeleton)
                }
            } else if (position < 0 || position >= items.size) {
                android.util.Log.w("TaskRV", "getViewAt out of bounds: pos=$position size=${items.size}")
                null
            } else {
                val item = items[position]
                val rv = RemoteViews(context.packageName, R.layout.widget_task_row)
                rv.setTextViewText(R.id.task_title, item.title)
                rv.setViewVisibility(R.id.task_done, if (item.done) android.view.View.VISIBLE else android.view.View.GONE)

                val dotRes = if (item.done) R.drawable.widget_status_dot_gray else R.drawable.widget_status_dot_green
                rv.setInt(R.id.status_dot, "setBackgroundResource", dotRes)

                val fillIn = Intent().apply {
                    action = TaskWidgetProvider.ACTION_TOGGLE
                    putExtra("task_id", item.id)
                }
                rv.setOnClickFillInIntent(R.id.row_root, fillIn)
                rv
            }
        } catch (t: Throwable) {
            android.util.Log.e("TaskRV", "getViewAt error at pos=$position", t)
            null
        }
    }

    override fun getLoadingView(): RemoteViews? = null
    override fun getViewTypeCount(): Int = 2 // skeleton + normal
    override fun getItemId(position: Int): Long = position.toLong()
    override fun hasStableIds(): Boolean = true

    private fun readTasksFromPrefs(): List<TaskItem> {
        return try {
            val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            val json = prefs.getString("widget:tasks:today", "[]") ?: "[]"
            android.util.Log.d("TaskRV", "readTasksFromPrefs json=${json.take(200)}")
            val arr = JSONArray(json)
            val out = ArrayList<TaskItem>(arr.length())
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                out.add(TaskItem(o.optString("id"), o.optString("title"), o.optBoolean("done", false)))
            }
            out
        } catch (t: Throwable) {
            android.util.Log.e("TaskRV", "readTasksFromPrefs error", t)
            emptyList()
        }
    }
}
