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

    // Build maps
    const schedByTask: Record<string, any> = {};
    for (const s of schedules) schedByTask[s.task_id] = s;

    // isDueToday server-side (uses provided now instant, formats by schedule timezone)
    const isDueToday = (taskId: string) => {
      const s = schedByTask[taskId];
      // If there is NO explicit schedule but the task has a weekly quota via goal template,
      // treat it as due on any day of the week until the quota is met.
      if (!s) {
        if (typeof weeklyQuotaByTask[taskId] === 'number') {
          const done = Number(weekCountByTask[taskId] || 0);
          const quota = weeklyQuotaByTask[taskId] as number;
          return done < quota;
        }
        return false;
      }
      const t = (tasks || []).find((x) => x.id === taskId);
      if (t && typeof weeklyQuotaByTask[taskId] === 'number') {
        const done = Number(weekCountByTask[taskId] || 0);
        const quota = weeklyQuotaByTask[taskId] as number;
        if (done >= quota) return false;
      }
      const todayStr = dateStrInTZ(s.timezone, now);
      if (s.start_date) {
        const start = String(s.start_date || '').slice(0, 10);
        const end = String(s.end_date || s.start_date || '').slice(0, 10);
        if (!(todayStr >= start && todayStr <= end)) return false;
      }
      if (s.frequency === 'once') return Boolean(s.start_date);
      if (s.frequency === 'daily') return true;
      if (s.frequency === 'weekly') {
        const d = dowInTZ(s.timezone, now);
        const hasDays = Array.isArray(s.byweekday) && (s.byweekday as any[]).length > 0;
        return hasDays ? (s.byweekday as any[]).includes(d) : true;
      }
      if (s.frequency === 'custom') {
        const d = dowInTZ(s.timezone, now);
        return Array.isArray(s.byweekday) && s.byweekday.includes(d);
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

    const dueTodayTasks = tasksWithFlag.filter((t) => t.active && isDueToday(t.id));
    const dueSchedules = schedules.filter((s) => dueTodayTasks.some((t) => t.id === s.task_id));

    if (debug) {
      const diag = (tasks ?? []).map((t: any) => {
        const s: any = schedByTask[t.id];
        const res = isDueToday(t.id);
        const todayStr = s ? dateStrInTZ(s.timezone, now) : dateStrInTZ(undefined, now);
        const dow = s ? dowInTZ(s.timezone, now) : dowInTZ(undefined, now);
        return {
          id: t.id,
          title: t.title,
          active: t.active,
          due: res,
          schedule: s || null,
          todayStr,
          dow,
          week_count: weekCountByTask[t.id] || 0,
          week_quota: weeklyQuotaByTask[t.id] ?? null,
        };
      });
      return NextResponse.json({ tasks: dueTodayTasks, schedules: dueSchedules, debug: { now: now.toISOString(), diagnostics: diag } });
    }

    return NextResponse.json({ tasks: dueTodayTasks, schedules: dueSchedules });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
