import { NextResponse } from 'next/server';
import { requireUser } from '@/utils/auth';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getShadowConfig, logDryRun } from '@/utils/shadow/config';

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = createClient();

    // Load config (global fallback)
    const cfg = await getShadowConfig(user.id);

    // Fetch timezone from user_preferences; fallback to DEFAULT_TIMEZONE (align with cron)
    let tz = String(process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata');
    try {
      const { data: pref } = await supabase
        .from('user_preferences')
        .select('timezone')
        .eq('user_id', user.id)
        .maybeSingle();
      if (pref?.timezone) tz = pref.timezone as any;
    } catch {}

    // Try to read today's snapshot from shadow_progress_daily
    let state = {
      date: new Date().toISOString().slice(0, 10),
      user_distance: 0,
      shadow_distance: 0,
      lead: 0,
      user_speed_avg: null as number | null,
      shadow_speed_target: cfg.shadow_speed_target ?? cfg.base_speed,
      difficulty_tier: (cfg as any).default_difficulty_tier || 'normal',
      next_checkpoints: [] as any[],
    };

    try {
      const { data } = await supabase
        .from('shadow_progress_daily')
        .select('date, user_distance, shadow_distance, lead, user_speed_avg, shadow_speed_target, difficulty_tier')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        state = {
          ...state,
          ...data,
        } as any;
      }
    } catch {}

    // Try to fetch events to align schedule to real deadlines (today in user's TZ)
    let eventsToday: any[] = [];
    try {
      const { data: evs } = await supabase
        .from('events')
        .select('id, due_start, due_end, status, routine_item_id')
        .eq('user_id', user.id)
        .order('due_start', { ascending: true })
        .limit(100);
      if (evs && evs.length) {
        const sameDay = (iso: string | null | undefined, tzStr: string) => {
          if (!iso) return false;
          const d = new Date(iso);
          const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tzStr, year: 'numeric', month: '2-digit', day: '2-digit' });
          const today = fmt.format(new Date());
          return fmt.format(d) === today;
        };
        eventsToday = evs.filter(e => sameDay(e.due_end || e.due_start, tz));
        state.next_checkpoints = eventsToday;
      }
    } catch {}

    // Phase 2B: dry-run snapshot log
    await logDryRun(user.id, 'state_snapshot', { cfg, tz, state });

    // Build a routine-like projection from tasks (tasks are the source of truth)
    try {
      // Resolve today's local day string for the user
      const todayInTz = (tzStr: string) => {
        const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tzStr, year: 'numeric', month: '2-digit', day: '2-digit' });
        return fmt.format(new Date()); // YYYY-MM-DD
      };
      const dayStr = todayInTz(tz);

      // Note: we no longer use persisted shadow passes; schedule rules drive deadlines.

      // Minute math helpers in user's timezone
      const partsNow = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
      const hh = Number(partsNow.find(p => p.type === 'hour')?.value || '0');
      const mm = Number(partsNow.find(p => p.type === 'minute')?.value || '0');
      const nowMin = hh * 60 + mm; // minutes since midnight in user's TZ
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, title, time_anchor, order_hint, owner_type, created_at, active, ep_value')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      const baseTasks = (tasks || []).filter((t: any) => (t.active ?? true) && (t.owner_type ?? 'user') === 'user');

      // Load schedules for these tasks
      const taskIds = baseTasks.map((t: any) => t.id);
      const schedulesByTask: Record<string, any[]> = {};
      if (taskIds.length) {
        try {
          const { data: scheds } = await supabase
            .from('task_schedules')
            .select('task_id, frequency, byweekday, at_time, start_date, end_date, timezone')
            .in('task_id', taskIds as any);
          for (const s of scheds || []) {
            (schedulesByTask[s.task_id] = schedulesByTask[s.task_id] || []).push(s);
          }
        } catch {}
      }

      const anchorOrder = ['morning', 'midday', 'evening', 'night', 'anytime'];
      const sorted = [...baseTasks].sort((a: any, b: any) => {
        const aA = String(a.time_anchor || 'anytime');
        const bA = String(b.time_anchor || 'anytime');
        const ao = anchorOrder.indexOf(aA);
        const bo = anchorOrder.indexOf(bA);
        if (ao !== bo) return ao - bo;
        const ah = a.order_hint == null ? Number.POSITIVE_INFINITY : Number(a.order_hint);
        const bh = b.order_hint == null ? Number.POSITIVE_INFINITY : Number(b.order_hint);
        if (ah !== bh) return ah - bh;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

      const grouped: Record<string, any[]> = { morning: [], midday: [], evening: [], night: [], anytime: [] };
      for (const t of sorted) {
        const key = (t.time_anchor as string) || 'anytime';
        grouped[key as keyof typeof grouped].push({ id: t.id, title: t.title, order_hint: t.order_hint ?? null });
      }

      // defer routineFlow assembly until after metrics so we can include shadow hints once

      // Build EP map per task (default 1 if missing)
      const epValueMap = new Map<string, number>();
      for (const t of sorted) {
        const val = typeof (t as any)?.ep_value === 'number' && !Number.isNaN((t as any).ep_value)
          ? Number((t as any).ep_value)
          : 1;
        epValueMap.set(String(t.id), val);
      }

      // Fetch today's user completions for timestamps (use admin client to bypass RLS edge cases for service ops)
      const admin = createAdminClient();
      let { data: completions } = await admin
        .from('task_completions')
        .select('task_id, completed_at, completed_on, ep_awarded')
        .eq('user_id', user.id)
        .eq('completed_on', dayStr);

      await logDryRun(user.id, 'state_snapshot', {
        debug: true,
        phase: 'task_completions_primary',
        tz,
        dayStr,
        userId: user.id,
        count: (completions || []).length,
      });

      completions = completions || [];

      const completedAtMap = new Map<string, string>();
      const completedTimes: Date[] = [];
      let user_ep_today_sum = 0;
      for (const r of (completions || [])) {
        if (r.task_id && (r as any).completed_at) {
          completedAtMap.set(String(r.task_id), String((r as any).completed_at));
          completedTimes.push(new Date(String((r as any).completed_at)));
        }
        // Default to 1 EP per completion if ep_awarded is null/undefined
        const epVal = (r as any)?.ep_awarded;
        if (typeof epVal === 'number' && !Number.isNaN(epVal)) {
          user_ep_today_sum += epVal;
        } else {
          user_ep_today_sum += 1;
        }
      }

      // Build schedule in minutes since midnight based on task_schedules, with event overrides
      const schedMinutes = new Map<string, number>();
      // Build override map from events: use due_end minute when available for today
      const minuteOf = (iso: string, tzStr: string) => {
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tzStr, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
        const h = Number(parts.find(p => p.type === 'hour')?.value || '0');
        const m = Number(parts.find(p => p.type === 'minute')?.value || '0');
        return h * 60 + m;
      };
      const eventOverride = new Map<string, number>();
      for (const e of eventsToday) {
        const taskId = e.routine_item_id ? String(e.routine_item_id) : null;
        const when = e.due_end || e.due_start;
        if (taskId && when) {
          eventOverride.set(taskId, minuteOf(when, tz));
        }
      }
      // Helpers for schedule matching
      const weekdayIndexFor = (ymd: string, tzStr: string): number => {
        try {
          const base = new Date(ymd + 'T12:00:00Z');
          const fmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tzStr });
          const wk = fmt.format(base);
          const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
          return map[wk] ?? new Date(ymd).getDay();
        } catch {
          return new Date(ymd).getDay();
        }
      };
      const dow = weekdayIndexFor(dayStr, tz);
      const parseAtTimeToMinute = (at: string): number | null => {
        const s = String(at || '').slice(0, 5);
        if (!/^\d{2}:\d{2}$/.test(s)) return null;
        const [h, m] = s.split(':').map((x) => parseInt(x, 10));
        return (h * 60 + m) % 1440;
      };

      // For each task, decide today's scheduled minute if any
      for (const t of sorted) {
        const tId = String(t.id);
        const arr = schedulesByTask[tId] || [];
        let chosen: number | null = null;
        if (arr.length) {
          for (const s of arr) {
            const startOk = !s.start_date || dayStr >= s.start_date;
            const endOk = !s.end_date || dayStr <= s.end_date;
            if (!startOk || !endOk) continue;
            // Frequency
            if (s.frequency === 'weekly') {
              const by = Array.isArray(s.byweekday) ? s.byweekday : [];
              if (!by.includes(dow)) continue;
            } else if (s.frequency === 'once') {
              if (!s.start_date || s.start_date !== dayStr) continue;
            } else if (s.frequency !== 'daily') {
              continue;
            }
            const atMin = parseAtTimeToMinute(s.at_time);
            if (atMin == null) continue;
            // Interpret at_time in sTz, but we compare minutes-of-day in user's tz.
            // For simplicity and cross-zone consistency, we treat minutes-of-day the same (common practice in this codebase).
            // If stricter conversion is needed, we can map at_time in sTz to user's tz, but most schedules use user's tz.
            chosen = typeof chosen === 'number' ? Math.min(chosen, atMin) : atMin; // earliest wins
          }
        }
        const override = eventOverride.get(tId);
        if (typeof override === 'number') {
          schedMinutes.set(tId, override);
        } else if (typeof chosen === 'number') {
          schedMinutes.set(tId, chosen);
        }
        // If neither override nor schedule exists for today, we will assign virtual times below
      }

      // Anchor-based default times for unscheduled tasks (today, user's TZ)
      // morning -> 09:00, midday -> 13:00, evening -> 18:00, night -> 21:00
      // IMPORTANT: Do not depend on current time for assignment.
      // We freeze today's virtual schedule so shadow times don't roll forward as now changes.
      const anchorDefaults: Record<string, number> = {
        morning: 9 * 60,
        midday: 13 * 60,
        evening: 18 * 60,
        night: 21 * 60,
      };
      for (const t of sorted) {
        const tId = String(t.id);
        if (schedMinutes.has(tId)) continue; // already scheduled via event/schedule
        const anchor = String(t.time_anchor || '').toLowerCase();
        const dflt = anchorDefaults[anchor];
        // Always use the anchor default if present, regardless of whether it's in the past.
        // If it's in the past, shadow will be considered done for this task.
        if (typeof dflt === 'number') {
          schedMinutes.set(tId, dflt);
        }
      }

      // Deterministic hourly spread for any remaining unscheduled tasks (e.g., 'anytime')
      // Start from a fixed time today (e.g., 10:00) to avoid rolling-forward ETAs
      // One task per hour, capped to end-of-day (23:59)
      const endOfDayMin = 23 * 60 + 59;
      const fixedStart = 10 * 60; // 10:00 local time
      let slot = fixedStart;
      for (const t of sorted) {
        const tId = String(t.id);
        if (schedMinutes.has(tId)) continue;
        if (slot > endOfDayMin) {
          // If we ran out of day, place at 23:59 so it can still pass today
          schedMinutes.set(tId, endOfDayMin);
          continue;
        }
        schedMinutes.set(tId, slot);
        slot += 60; // next hour
      }

      // Compute metrics
      // Time saved: signed minutes (user earlier => positive; later => negative)
      let time_saved_minutes = 0;
      const minutesOfInTz = (ts: string, tzStr: string) => {
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tzStr, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ts));
        const h = Number(parts.find(p => p.type === 'hour')?.value || '0');
        const m = Number(parts.find(p => p.type === 'minute')?.value || '0');
        return h * 60 + m;
      };
      for (const [taskId, userTs] of completedAtMap.entries()) {
        const sMin = schedMinutes.get(taskId);
        if (typeof sMin === 'number') {
          const uMin = minutesOfInTz(userTs, tz);
          const diffMin = sMin - uMin; // positive => user earlier than schedule; negative => user later
          time_saved_minutes += diffMin;
        }
      }

      // Pace consistency from user completion intervals
      let pace_consistency = 0;
      if (completedTimes.length >= 2) {
        completedTimes.sort((a, b) => a.getTime() - b.getTime());
        const intervals: number[] = [];
        for (let i = 1; i < completedTimes.length; i++) {
          intervals.push((completedTimes[i].getTime() - completedTimes[i - 1].getTime()) / 60000);
        }
        const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
        if (mean > 0) {
          const variance = intervals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / intervals.length;
          const std = Math.sqrt(variance);
          const cv = std / mean;
          pace_consistency = Math.max(0, 1 - cv);
        }
      }

      // Progress delta now and projected
      const user_done_now = completedAtMap.size;
      let shadow_done_now = 0;
      let shadow_done_in_60 = 0;
      const nowPlus60 = nowMin + 60;
      for (const [, schedMin] of schedMinutes.entries()) {
        if (schedMin <= nowMin) shadow_done_now += 1;
        if (schedMin <= nowPlus60) shadow_done_in_60 += 1;
      }
      const progress_delta_now = user_done_now - shadow_done_now;
      const progress_delta_projected = user_done_now - shadow_done_in_60;

      // Average user speed today: tasks per hour since start of day
      const elapsed_hours = Math.max(1 / 60, nowMin / 60); // avoid div-by-zero early day
      const user_speed_avg_today = user_done_now / elapsed_hours;

      // Target per-hour speed for shadow (from config)
      const shadow_speed_target_per_hour = Number(cfg.shadow_speed_target ?? cfg.base_speed);

      // Shadow expected done by target curve (linear), in addition to schedule-based shadow_done_now
      const shadow_expected_done_by_target = Math.max(0, Math.floor(elapsed_hours * shadow_speed_target_per_hour));

      // Projections to end of day
      const total_tasks_today = sorted.length;
      const remaining_hours_today = Math.max(0, (24 * 60 - nowMin) / 60);
      const projected_completed_user_today = user_done_now + user_speed_avg_today * remaining_hours_today;
      const projected_delta_end = projected_completed_user_today - total_tasks_today;

      // Day-level ETAs (minutes from now)
      let projected_user_finish_minutes: number | null = null;
      if (user_done_now > 0 && total_tasks_today > user_done_now) {
        const avg_gap_min = nowMin / Math.max(1, user_done_now);
        const tasks_remaining = total_tasks_today - user_done_now;
        projected_user_finish_minutes = Math.round(avg_gap_min * tasks_remaining);
      }
      let planned_shadow_finish_minutes: number | null = null;
      if (schedMinutes.size > 0) {
        const lastSched = Math.max(...Array.from(schedMinutes.values()));
        planned_shadow_finish_minutes = Math.max(0, lastSched - nowMin);
      }

      // Instantaneous speeds (approx): tasks/hour
      // - user_speed_now: completions within last 60 minutes
      // - shadow_speed_now: expected tasks scheduled in next 60 minutes
      let user_speed_now = 0;
      if (completedTimes.length) {
        const oneHourAgo = Date.now() - 60 * 60000;
        const recent = completedTimes.filter((d) => d.getTime() >= oneHourAgo).length;
        user_speed_now = recent; // per hour, since window is 60m
      }
      const shadow_speed_now = Math.max(0, shadow_done_in_60 - shadow_done_now);

      // Build routineFlow with shadow hints
      const routineFlow = [
        { anchor: 'morning', items: grouped.morning },
        { anchor: 'midday', items: grouped.midday },
        { anchor: 'evening', items: grouped.evening },
        { anchor: 'night', items: grouped.night },
        { anchor: 'anytime', items: grouped.anytime },
      ];

      const fmtMinuteLabel = (min: number | null) => {
        if (typeof min !== 'number') return null;
        const h = Math.floor(min / 60);
        const m = min % 60;
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 === 0 ? 12 : (h % 12);
        const mm = String(m).padStart(2, '0');
        return `${h12}:${mm} ${ampm}`;
      };

      const tasksWithShadow = sorted.map((t: any) => {
        const schedMin = schedMinutes.get(t.id);
        const userCompletedAt = completedAtMap.get(t.id) || null;
        // Shadow passes strictly when deadline (schedMin) has passed. If no schedule today, it does not pass.
        const is_shadow_done = typeof schedMin === 'number' ? (schedMin <= nowMin) : false;
        const etaMin = typeof schedMin === 'number' ? Math.max(0, schedMin - nowMin) : null;
        const userCompletedMinute = userCompletedAt ? minutesOfInTz(userCompletedAt, tz) : null;
        return {
          id: t.id,
          title: t.title,
          time_anchor: t.time_anchor || 'anytime',
          user_completed_at: userCompletedAt,
          user_completed_minute: userCompletedMinute,
          user_time_label: fmtMinuteLabel(userCompletedMinute),
          shadow_scheduled_at: null, // minute-based; omit ISO to avoid tz confusion
          shadow_scheduled_minute: typeof schedMin === 'number' ? schedMin : null,
          shadow_time_label: fmtMinuteLabel(typeof schedMin === 'number' ? schedMin : null),
          shadow_eta_minutes: etaMin,
          is_user_done: !!userCompletedAt,
          is_shadow_done,
        };
      });

      // EP-style summary for today:
      // - User EP: sum of ep_awarded from completions (fallback 1 if missing)
      // - Shadow EP: sum of ep_value for tasks expected done by now (based on schedule)
      // - Shadow total: sum of ep_value for all tasks planned today
      const shadow_ep_today_sum = Array.from(schedMinutes.entries()).reduce((acc, [taskId, schedMin]) => {
        if (schedMin <= nowMin) return acc + (epValueMap.get(String(taskId)) ?? 1);
        return acc;
      }, 0);
      const shadow_total_ep = sorted.reduce((acc: number, t: any) => acc + (epValueMap.get(String(t.id)) ?? 1), 0);
      const ep_today = {
        user: user_ep_today_sum, // sum of EP earned today
        shadow: shadow_ep_today_sum, // sum of ep_value for tasks shadow has passed by now
        shadow_total: shadow_total_ep,
      } as const;

      // Log dry-run for visibility
      await logDryRun(user.id, 'state_snapshot', { routineFlowCount: sorted.length, anchors: anchorOrder });

      // Helpers
      const fmtMinutes = (mins: number) => {
        const sign = mins < 0 ? '-' : '+';
        const mAbs = Math.abs(Math.round(mins));
        const h = Math.floor(mAbs / 60);
        const mm = mAbs % 60;
        const core = h > 0 ? `${h}h ${mm}m` : `${mm}m`;
        return `${sign}${core}`;
      };

      // Build shadow task projections (minute-only schedule exposed as eta + done flag)
      const shadow_tasks = tasksWithShadow.map((t: any) => ({
        id: t.id,
        title: t.title,
        shadow_eta_minutes: t.shadow_eta_minutes,
        is_shadow_done: t.is_shadow_done,
      }));

      // Top-level aliases for frontend simplicity
      const topLevel = {
        ep_today: ep_today.user,
        shadow_ep_today: ep_today.shadow,
        user_speed: `${user_speed_now}/h`, // instantaneous
        shadow_speed: `${shadow_speed_now}/h`, // instantaneous (next 60m)
        user_speed_avg_today: Number(user_speed_avg_today.toFixed(2)),
        shadow_speed_target_per_hour: shadow_speed_target_per_hour,
        delta_now: progress_delta_now,
        time_saved: fmtMinutes(time_saved_minutes),
        pace_consistency,
        today_tasks: tasksWithShadow,
        shadow_tasks,
        active_challenges: [],
        history: [],
        projected_user_finish_minutes,
        planned_shadow_finish_minutes,
      } as const;

      return NextResponse.json({
        ...state,
        ...topLevel,
        routineFlow,
        metrics: {
          time_saved_minutes,
          pace_consistency,
          progress_delta_now,
          progress_delta_projected,
          user_speed_now,
          shadow_speed_now,
          user_speed_avg_today,
          shadow_expected_done_by_target,
          projected_completed_user_today,
          projected_delta_end,
        },
        ep_today,
        tasks: tasksWithShadow,
      });
    } catch {
      // If tasks table/columns are missing, return base state
      return NextResponse.json(state);
    }

    return NextResponse.json(state);
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
