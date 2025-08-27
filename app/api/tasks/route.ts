import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createClient();

    // Get all tasks for this user (active and inactive)
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('id, user_id, title, description, ep_value, min_level, active')
      .eq('user_id', user.id)
      .order('title');

    if (error) throw error;

    // Fetch schedules
    const ids = (tasks ?? []).map((t) => t.id);
    let schedules: any[] = [];
    let completedToday: Record<string, boolean> = {};
    let lastCompleted: Record<string, string> = {};
    // goal metadata mapping per task
    const goalByTask: Record<string, { id: string; title: string }> = {};
    // goal template weekly quota mapping per task (only for weekly frequency templates)
    const weeklyQuotaByTask: Record<string, number> = {};
    // this week's completion counts per task
    const weekCountByTask: Record<string, number> = {};
    if (ids.length) {
      const { data: scheds, error: sErr } = await supabase.from('task_schedules').select('*').in('task_id', ids);
      if (sErr) throw sErr;
      schedules = scheds ?? [];

      // today's completions for these tasks
      const { data: completes, error: cErr } = await supabase
        .from('task_completions')
        .select('task_id')
        .eq('user_id', user.id)
        .eq('completed_on', new Date().toISOString().slice(0, 10));
      if (cErr) throw cErr;
      for (const c of completes || []) completedToday[c.task_id] = true;

      // last completion date per task (pick most recent row per task)
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

      // fetch goal linkage and metadata (if any)
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

      // Map weekly quotas from goal templates if present
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
      const now = new Date();
      // Compute Monday-based week start
      const dow = now.getDay(); // 0..6 (Sun..Sat)
      const diffToMonday = (dow + 6) % 7; // days since Monday
      const start = new Date(now);
      start.setDate(now.getDate() - diffToMonday);
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

    // attach completedToday field
    const tasksWithFlag = (tasks ?? []).map((t: any) => ({
      ...t,
      completedToday: Boolean(completedToday[t.id]),
      last_completed_on: lastCompleted[t.id] || null,
      goal: goalByTask[t.id] || null,
      week_count: weekCountByTask[t.id] || 0,
      week_quota: weeklyQuotaByTask[t.id] ?? null,
    }));

    return NextResponse.json({ tasks: tasksWithFlag, schedules });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { title, description, ep_value = 10, schedule } = body || {};
    if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });
    // EP validation
    if (typeof ep_value !== 'number' || !Number.isFinite(ep_value) || ep_value < 0) {
      return NextResponse.json({ error: 'EP value must be a non-negative number' }, { status: 400 });
    }
    if (ep_value > 100) {
      return NextResponse.json({ error: 'EP value cannot exceed 100' }, { status: 400 });
    }

    const supabase = createClient();
    const { data: inserted, error } = await supabase
      .from('tasks')
      .insert({ user_id: user.id, title, description, ep_value, min_level: 1 })
      .select('*')
      .single();
    if (error) throw error;

    if (schedule) {
      const { frequency, byweekday = null, at_time = null, timezone = 'UTC', start_date = null, end_date = null } = schedule;
      if (!['daily', 'weekly', 'custom', 'once'].includes(frequency)) {
        return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 });
      }
      if (frequency === 'once') {
        const dateOk = typeof start_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(start_date);
        const timeOk = typeof at_time === 'string' && /^\d{2}:\d{2}$/.test(String(at_time).slice(0,5));
        if (!dateOk || !timeOk) {
          return NextResponse.json({ error: "For one-time tasks, start_date (YYYY-MM-DD) and at_time (HH:MM) are required." }, { status: 400 });
        }
      }
      // Resolve timezone: prefer provided value; else user's preference; else DEFAULT_TIMEZONE; else Asia/Kolkata
      let tz = String(timezone || '').trim();
      if (!tz || tz === 'UTC') {
        try {
          const { data: pref } = await supabase
            .from('user_preferences')
            .select('timezone')
            .eq('user_id', user.id)
            .maybeSingle();
          tz = String(pref?.timezone || '').trim() || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';
        } catch {
          tz = process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';
        }
      }

      const { error: sErr } = await supabase
        .from('task_schedules')
        .insert({ task_id: inserted.id, frequency, byweekday, at_time, timezone: tz, start_date, end_date: end_date || start_date });
      if (sErr) throw sErr;
    }

    return NextResponse.json(inserted);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

