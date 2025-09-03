package com.nourishme.app

import android.content.Context
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit
import java.util.Calendar

object ShadowWorkScheduler {
    private const val MORNING_WORK = "shadow_morning_checkin"
    private const val NUDGE_WORK = "shadow_nudges"
    private const val RECALC_WORK = "shadow_recalc"

    @JvmStatic
    fun scheduleAll(context: Context) {
        scheduleMorningCheckIn(context)
        scheduleNudges(context)
        scheduleRecalc(context)
    }

    private fun scheduleMorningCheckIn(context: Context) {
        val initialDelayMinutes = minutesUntilNextHour(context, 8)
        val request = PeriodicWorkRequestBuilder<ShadowMorningCheckInWorker>(24, TimeUnit.HOURS)
            .setConstraints(ShadowMorningCheckInWorker.networkConstraints())
            .setInitialDelay(initialDelayMinutes, TimeUnit.MINUTES)
            .addTag(MORNING_WORK)
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            MORNING_WORK,
            ExistingPeriodicWorkPolicy.KEEP,
            request
        )
    }

    private fun scheduleNudges(context: Context) {
        // 3x/day ~ every 8 hours
        val request = PeriodicWorkRequestBuilder<ShadowNudgesWorker>(8, TimeUnit.HOURS)
            .setConstraints(ShadowNudgesWorker.networkConstraints())
            .addTag(NUDGE_WORK)
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            NUDGE_WORK,
            ExistingPeriodicWorkPolicy.KEEP,
            request
        )
    }

    private fun scheduleRecalc(context: Context) {
        val request = PeriodicWorkRequestBuilder<ShadowRecalcWorker>(4, TimeUnit.HOURS)
            .setConstraints(ShadowRecalcWorker.networkConstraints())
            .addTag(RECALC_WORK)
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            RECALC_WORK,
            ExistingPeriodicWorkPolicy.KEEP,
            request
        )
    }

    private fun minutesUntilNextHour(context: Context, hour: Int): Long {
        return try {
            val now = Calendar.getInstance()
            val next = Calendar.getInstance().apply {
                set(Calendar.HOUR_OF_DAY, hour)
                set(Calendar.MINUTE, 0)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
                if (before(now)) add(Calendar.DAY_OF_YEAR, 1)
            }
            val diffMs = next.timeInMillis - now.timeInMillis
            Math.max(1L, diffMs / 60000L)
        } catch (_: Throwable) { 60L }
    }
}
