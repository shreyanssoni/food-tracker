import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

function isoDay(d: Date) { return d.toISOString().slice(0,10); }

// Returns true if the task is scheduled on the given date per its schedule row
function taskScheduledOn(schedule: any, date: Date): boolean {
  if (!schedule) return false;
  const { frequency, byweekday, start_date, end_date } = schedule;
  const day = date.getDay(); // 0..6 Sun..Sat
  const ymd = isoDay(date);
  if (start_date && ymd < start_date) return false;
  if (end_date && ymd > end_date) return false;
  if (frequency === 'daily') return true;
  if (frequency === 'weekly') {
    const arr = Array.isArray(byweekday) ? byweekday : [];
    return arr.includes(day);
  }
  // For now, ignore custom schedules
  return false;
}

async function allTasksCompletedForDate(supabase: any, userId: string, date: Date) {
  // Fetch tasks and schedules
  const { data: tasks, error: tErr } = await supabase
    .from('tasks')
    .select('id, active')
    .eq('user_id', userId);
  if (tErr) throw tErr;
  const ids = (tasks || []).map((t: any) => t.id);
  let schedules: Record<string, any[]> = {};
  if (ids.length) {
    const { data: scheds, error: sErr } = await supabase
      .from('task_schedules')
      .select('*')
      .in('task_id', ids);
    if (sErr) throw sErr;
    for (const s of scheds || []) {
      schedules[s.task_id] = schedules[s.task_id] || [];
      schedules[s.task_id].push(s);
    }
  }
  // Determine which tasks are scheduled on date
  const scheduledTaskIds: string[] = [];
  for (const t of tasks || []) {
    if (!t.active) continue;
    const arr = schedules[t.id] || [];
    if (arr.some((s: any) => taskScheduledOn(s, date))) scheduledTaskIds.push(t.id);
  }
  if (scheduledTaskIds.length === 0) {
    return { eligible: false, allDone: false }; // nothing scheduled today
  }
  // Completions for date
  const ymd = isoDay(date);
  const { data: comps, error: cErr } = await supabase
    .from('task_completions')
    .select('task_id')
    .eq('user_id', userId)
    .eq('completed_on', ymd)
    .in('task_id', scheduledTaskIds);
  if (cErr) throw cErr;
  const doneSet = new Set((comps || []).map((c: any) => c.task_id));
  const allDone = scheduledTaskIds.every((id) => doneSet.has(id));
  return { eligible: true, allDone };
}

async function getStreakDays(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('life_streak_days')
    .select('day, counted, revived')
    .eq('user_id', userId)
    .order('day', { ascending: true });
  if (error && error.code !== 'PGRST116') throw error; // table may not exist
  return data || [];
}

function computeCurrentAndLongest(days: Array<{ day: string; counted: boolean }>, todayKey: string) {
  const set = new Set(days.filter(d => d.counted).map(d => d.day));
  // current: count backwards from today
  let cur = 0;
  let d = new Date(todayKey);
  while (true) {
    const key = isoDay(d);
    if (set.has(key)) {
      cur += 1;
      d.setDate(d.getDate() - 1);
      continue;
    }
    break;
  }
  // longest: scan consecutive runs
  let longest = 0;
  if (set.size) {
    const sorted = Array.from(set).sort();
    // Use a sliding window
    let run = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i-1]);
      const curr = new Date(sorted[i]);
      prev.setDate(prev.getDate() + 1);
      if (isoDay(prev) === isoDay(curr)) {
        run += 1;
      } else {
        if (run > longest) longest = run;
        run = 1;
      }
    }
    if (run > longest) longest = run;
  }
  return { current: cur, longest };
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createClient();

    // Use UTC-based date keys to avoid timezone drift between server and DB (which stores DATE in UTC)
    const now = new Date();
    const todayKey = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Ensure table exists gracefully (skip if not created yet)
    let days = await getStreakDays(supabase, user.id);

    // Auto-count today if all scheduled tasks are completed and not counted yet
    const todayRow = days.find((d: any) => d.day === todayKey);
    if (!todayRow) {
      const { eligible, allDone } = await allTasksCompletedForDate(supabase, user.id, now);
      if (eligible && allDone) {
        await supabase.from('life_streak_days').insert({ user_id: user.id, day: todayKey, counted: true, revived: false });
        days = await getStreakDays(supabase, user.id);
      }
    }

    // Compute current/longest streaks
    const { current, longest } = computeCurrentAndLongest(days as any, todayKey);

    // Revive eligibility: yesterday missed (eligible day) and not counted nor revived
    const yKey = isoDay(yesterday);
    const yRow = (days as any).find((d: any) => d.day === yKey);
    let canRevive = false;
    if (!yRow) {
      const { eligible, allDone } = await allTasksCompletedForDate(supabase, user.id, yesterday);
      if (eligible && !allDone) canRevive = true;
    }

    return NextResponse.json({ lifeStreak: { current, longest, canRevive, reviveCost: 10 } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
