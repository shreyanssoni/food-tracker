package com.nourishme.app

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.NetworkType
import androidx.work.WorkerParameters
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

class ShadowNudgesWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        return try {
            // Endpoint to evaluate and possibly send a nudge/taunt
            val prefs = applicationContext.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            val endpoint = prefs.getString(
                "shadow:endpoints:nudges",
                "https://nourish-me.vercel.app/api/shadow/taunts/nudge?cron=1"
            ) ?: "https://nourish-me.vercel.app/api/shadow/taunts/nudge?cron=1"
            httpGet(endpoint)
            Result.success()
        } catch (_: Throwable) {
            Result.retry()
        }
    }

    companion object {
        fun networkConstraints(): Constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
    }
}

private fun httpGet(endpoint: String) {
    val url = URL(endpoint)
    val conn = (url.openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = 10000
        readTimeout = 10000
    }
    try {
        val code = conn.responseCode
        val reader = if (code in 200..299) {
            BufferedReader(InputStreamReader(conn.inputStream))
        } else {
            BufferedReader(InputStreamReader(conn.errorStream ?: conn.inputStream))
        }
        reader.use { it.readText() }
    } finally {
        conn.disconnect()
    }
}
