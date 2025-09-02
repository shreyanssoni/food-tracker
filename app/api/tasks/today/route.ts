/* eslint-disable prefer-const */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

// Helpers
const normalizeTz = (tz?: string | null) => {
  const t = String(tz || '').trim();
  return t || (process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata');
};
const dateStrInTZ = (tz?: string | null, at?: Date) => {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: normalizeTz(tz),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(at || new Date());
};
const dowInTZ = (tz?: string | null, at?: Date) => {
  try {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: normalizeTz(tz), weekday: 'short' }).format(at || new Date());
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[wd as keyof typeof map] ?? (at || new Date()).getDay();
  } catch {
    return (at || new Date()).getDay();
  }
};

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createClient();

    const { searchParams } = new URL(req.url);
    const nowParam = searchParams.get('now');
    const debug = searchParams.get('debug') === '1';
    const now = nowParam ? new Date(nowParam) : new Date();

    // Load all tasks first, similar to /api/tasks
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('id, user_id, title, description, ep_value, min_level, active')
      .eq('user_id', user.id)
      .order('title');
    if (error) throw error;

    const ids = (tasks ?? []).map((t) => t.id);
    let schedules: any[] = [];
    let completedToday: Record<string, boolean> = {};
    let lastCompleted: Record<string, string> = {};
    const goalByTask: Record<string, { id: string; title: string }> = {};
    const weeklyQuotaByTask: Record<string, number> = {};
    const weekCountByTask: Record<string, number> = {};

    if (ids.length) {
      const { data: scheds, error: sErr } = await supabase
        .from('task_schedules')
        .select('*')
        .in('task_id', ids);
      if (sErr) throw sErr;
      schedules = scheds ?? [];

      // today's completions for these tasks (server local "today" used only for flagging; UI will filter separately)
      const { data: completes, error: cErr } = await supabase
        .from('task_completions')
        .select('task_id')
        .eq('user_id', user.id)
        .eq('completed_on', now.toISOString().slice(0, 10));
      if (cErr) throw cErr;
      for (const c of completes || []) completedToday[c.task_id] = true;

      // last completion date per task (most recent row per task)
      const { data: recent, error: rErr } = await supabase
        .from('task_completions')
        .select('task_id, completed_on')
        .eq('user_id', user.id)
        .in('task_id', ids)
        .order('completed_on', { ascending: false });
      if (rErr) throw rErr;
      const seen = new Set<string>();
      for (const row of recent || []) {
        if (!seen.has(row.task_id)) {
          lastCompleted[row.task_id] = row.completed_on as any;
          seen.add(row.task_id);
        }
      }

      // goal linkage and metadata
      const { data: links, error: lErr } = await supabase
        .from('goal_tasks')
        .select('task_id, goal_id, template_id')
        .in('task_id', ids);
      if (lErr) throw lErr;
      const goalIds = Array.from(new Set((links || []).map((x: any) => x.goal_id))).filter(Boolean);
      if (goalIds.length) {
        const { data: goals, error: gErr } = await supabase
          .from('goals')
          .select('id, title')
          .in('id', goalIds);
        if (gErr) throw gErr;
        const gMap: Record<string, { id: string; title: string }> = {};
        for (const g of goals || []) gMap[g.id] = { id: g.id, title: g.title } as any;
        for (const lk of links || []) {
          const g = gMap[lk.goal_id as string];
          if (g) goalByTask[lk.task_id as string] = g;
        }
      }

      // weekly quota from templates
      if ((links || []).length) {
        const tmplIds = Array.from(new Set((links || []).map((x: any) => x.template_id).filter(Boolean)));
        if (tmplIds.length) {
          const { data: tmpls, error: tErr } = await supabase
            .from('goal_task_templates')
            .select('id, frequency, times_per_period')
            .in('id', tmplIds as any);
          if (tErr) throw tErr;
          const tMap: Record<string, { frequency: string; times_per_period: number }> = {};
          for (const r of tmpls || []) tMap[r.id] = { frequency: r.frequency as string, times_per_period: r.times_per_period as number };
          for (const lk of links || []) {
            const tm = tMap[lk.template_id as string];
            if (tm && tm.frequency === 'weekly') weeklyQuotaByTask[lk.task_id as string] = Number(tm.times_per_period || 0);
          }
        }
      }

      // Count completions this week per task
      const curr = new Date(now);
      const dow = curr.getDay();
      const diffToMonday = (dow + 6) % 7;
      const start = new Date(curr);
      start.setDate(curr.getDate() - diffToMonday);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      const weekStart = start.toISOString().slice(0, 10);
      const weekEnd = end.toISOString().slice(0, 10);
      const { data: weekComps, error: wcErr } = await supabase
        .from('task_completions')
        .select('task_id, completed_on')
        .eq('user_id', user.id)
        .in('task_id', ids)
        .gte('completed_on', weekStart)
        .lte('completed_on', weekEnd);
      if (wcErr) throw wcErr;
      for (const r of weekComps || []) {
        const k = r.task_id as string;
        weekCountByTask[k] = (weekCountByTask[k] || 0) + 1;
      }
    }

    // Build maps (support multiple schedules per task)
    const schedulesByTask: Record<string, any[]> = {};
    for (const s of schedules) {
      const k = String(s.task_id);
      (schedulesByTask[k] = schedulesByTask[k] || []).push(s);
    }

    // isDueToday server-side (uses provided now instant, formats by schedule timezone)
    const isDueToday = (taskId: string) => {
      const arr = schedulesByTask[taskId] || [];
      // If there is NO explicit schedule but the task has a weekly quota via goal template,
      // treat it as due on any day of the week until the quota is met.
      if (!arr.length) {
        if (typeof weeklyQuotaByTask[taskId] === 'number') {
          const done = Number(weekCountByTask[taskId] || 0);
          const quota = weeklyQuotaByTask[taskId] as number;
          return done < quota;
        }
        return false;
      }
      // If quota is already met, short-circuit to false
      if (typeof weeklyQuotaByTask[taskId] === 'number') {
        const done = Number(weekCountByTask[taskId] || 0);
        const quota = weeklyQuotaByTask[taskId] as number;
        if (done >= quota) return false;
      }
      // Due if ANY schedule instance for the task says due today
      for (const s of arr) {
        const todayStr = dateStrInTZ(s.timezone, now);
        if (s.start_date) {
          const start = String(s.start_date || '').slice(0, 10);
          const end = s.end_date ? String(s.end_date).slice(0, 10) : null;
          if (s.frequency === 'once') {
            if (todayStr === start) return true; // one-time due today
            continue; // otherwise not due by this schedule
          }
          // Recurring schedules: enforce window
          if (end) {
            if (!(todayStr >= start && todayStr <= end)) continue;
          } else {
            if (!(todayStr >= start)) continue;
          }
        }
        if (s.frequency === 'once') {
          // handled above
          continue;
        }
        if (s.frequency === 'daily') return true;
        if (s.frequency === 'weekly') {
          const d = dowInTZ(s.timezone, now);
          const hasDays = Array.isArray(s.byweekday) && (s.byweekday as any[]).length > 0;
          if (hasDays) {
            if ((s.byweekday as any[]).includes(d)) return true;
          } else {
            // No explicit weekdays: use weekly quota fallback if present
            const quota = weeklyQuotaByTask[taskId];
            if (typeof quota === 'number') {
              const done = Number(weekCountByTask[taskId] || 0);
              if (done < quota) return true;
            }
          }
          continue;
        }
        if (s.frequency === 'custom') {
          const d = dowInTZ(s.timezone, now);
          if (Array.isArray(s.byweekday) && s.byweekday.includes(d)) return true;
          continue;
        }
      }
      return false;
    };

    const tasksWithFlag = (tasks ?? []).map((t: any) => ({
      ...t,
      completedToday: Boolean(completedToday[t.id]),
      last_completed_on: lastCompleted[t.id] || null,
      goal: goalByTask[t.id] || null,
      week_count: weekCountByTask[t.id] || 0,
      week_quota: weeklyQuotaByTask[t.id] ?? null,
    }));

    // Filter tasks that are active and due today
    const dueTasks = tasksWithFlag.filter((t: any) => Boolean(t.active) && isDueToday(t.id));
    const dueIds = new Set(dueTasks.map((t: any) => t.id));
    const dueSchedules = (schedules || []).filter((s: any) => dueIds.has(s.task_id));

    if (debug) {
      const diag = dueTasks.map((t: any) => ({
        id: t.id,
        title: t.title,
        active: t.active,
        week_count: t.week_count,
        week_quota: t.week_quota,
        hasSchedule: Array.isArray((schedulesByTask as any)[t.id]) && (schedulesByTask as any)[t.id].length > 0,
      }));
      console.debug("/api/tasks/today returning", { count: dueTasks.length, schedules: dueSchedules.length, diag });
    }

    return NextResponse.json({ tasks: dueTasks, schedules: dueSchedules });
  } catch (e: any) {
    console.error("/api/tasks/today error", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
