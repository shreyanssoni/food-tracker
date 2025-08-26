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

function computeCurrentAndLongest(days: Array<{ day: string; counted?: boolean; revived?: boolean }>, todayKey: string) {
  // Count a day if it was either normally counted or revived
  const set = new Set(days.filter(d => d.counted || d.revived).map(d => d.day));
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

    // Do not mutate streaks here; finalization happens via /api/life-streak/finalize cron

    // Compute current/longest streaks
    const { current, longest } = computeCurrentAndLongest(days as any, todayKey);

    // Build current week statuses (Sun..Sat) with colors controlled by client
    const startOfWeek = (d: Date) => {
      const x = new Date(d);
      const day = x.getUTCDay(); // 0..6 Sun..Sat
      x.setUTCDate(x.getUTCDate() - day);
      x.setUTCHours(0,0,0,0);
      return x;
    };
    const sow = startOfWeek(now);
    // Fetch user creation date to avoid penalizing pre-account days
    const { data: userRow } = await supabase
      .from('app_users')
      .select('created_at')
      .eq('id', user.id)
      .maybeSingle();
    const createdAtUtc = userRow?.created_at ? new Date(userRow.created_at) : new Date('1970-01-01T00:00:00Z');
    const createdKey = isoDay(createdAtUtc);
    const week: Array<{ day: string; status: 'counted'|'revived'|'missed'|'none' }> = [];
    const daysByKey: Record<string, { counted: boolean; revived: boolean }> = {};
    for (const d of days as any[]) {
      daysByKey[d.day] = { counted: !!d.counted, revived: !!d.revived };
    }
    for (let i = 0; i < 7; i++) {
      const d = new Date(sow);
      d.setUTCDate(sow.getUTCDate() + i);
      const key = isoDay(d);
      const row = daysByKey[key];
      // Do not mark future days as missed; also ignore days before account creation
      const todayOnly = isoDay(now);
      if (key > todayOnly || key < createdKey) {
        week.push({ day: key, status: 'none' });
        continue;
      }
      if (row?.revived) {
        week.push({ day: key, status: 'revived' });
        continue;
      }
      if (row?.counted) {
        week.push({ day: key, status: 'counted' });
        continue;
      }
      // Determine eligibility to label as missed or none
      // Note: we use server time in UTC for eligibility windows, consistent with other checks in this route
      let status: 'missed'|'none' = 'none';
      try {
        const { eligible, allDone } = await allTasksCompletedForDate(supabase, user.id, d);
        // Only past days (<= yesterday) can be missed
        const isPast = key < todayOnly;
        if (isPast && eligible && !allDone) status = 'missed';
        // If eligible && allDone but not counted, conservatively call it 'missed' (shouldn't happen normally)
        if (isPast && eligible && allDone && !row) status = 'missed';
      } catch {
        status = 'none';
      }
      week.push({ day: key, status });
    }

    // Compute weekly streaks for the last ~12 weeks based on life-streak (all tasks) logic
    // A week is a success if on every eligible day in that week up to 'today', the user has either counted or revived.
    const weeksBack = 12;
    const weeksFlags: boolean[] = [];
    for (let w = weeksBack - 1; w >= 0; w--) {
      const ws = new Date(sow);
      ws.setUTCDate(sow.getUTCDate() - w * 7);
      const we = new Date(ws);
      we.setUTCDate(ws.getUTCDate() + 6);
      let eligibleDays = 0;
      let satisfied = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(ws);
        d.setUTCDate(ws.getUTCDate() + i);
        const key = isoDay(d);
        // Ignore days before account creation and future days
        const todayOnly = isoDay(now);
        if (key < createdKey || key > todayOnly) continue;
        // Do not require today's completion in the current week
        if (w === 0 && key === todayOnly) continue;
        try {
          const { eligible } = await allTasksCompletedForDate(supabase, user.id, d);
          if (!eligible) continue;
          eligibleDays++;
          const row = daysByKey[key];
          if (row?.counted || row?.revived) satisfied++;
        } catch {}
      }
      const success = eligibleDays > 0 && satisfied === eligibleDays;
      // Do NOT include the current (ongoing) week in streak calculations
      if (w !== 0) {
        weeksFlags.push(success);
      }
    }
    // consecutive = trailing successes; longest = max run
    let weeklyConsecutive = 0;
    for (let i = weeksFlags.length - 1; i >= 0; i--) {
      if (weeksFlags[i]) weeklyConsecutive++; else break;
    }
    let weeklyLongest = 0, runW = 0;
    for (const f of weeksFlags) { if (f) { runW++; weeklyLongest = Math.max(weeklyLongest, runW); } else runW = 0; }

    // Count counted/revived days in current week for display
    const currentWeekDays = week.filter((d) => d.status === 'counted' || d.status === 'revived').length;

    // Revive eligibility: yesterday missed (eligible day) and not counted nor revived
    const yKey = isoDay(yesterday);
    const yRow = (days as any).find((d: any) => d.day === yKey);
    let canRevive = false;
    if (!yRow) {
      const { eligible, allDone } = await allTasksCompletedForDate(supabase, user.id, yesterday);
      if (eligible && !allDone) canRevive = true;
    }

    return NextResponse.json({ lifeStreak: { current, longest, canRevive, reviveCost: 10, week, weekly: { consecutive: weeklyConsecutive, longest: weeklyLongest, currentWeekDays } } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
