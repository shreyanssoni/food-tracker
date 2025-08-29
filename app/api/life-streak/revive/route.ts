import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

function isoDay(d: Date) { return d.toISOString().slice(0,10); }

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
    const day = date.getDay();
    const ymd = isoDay(date);
    if (arr.some((sch: any) => {
      const { frequency, byweekday, start_date, end_date } = sch;
      if (start_date && ymd < start_date) return false;
      if (end_date && ymd > end_date) return false;
      if (frequency === 'daily') return true;
      if (frequency === 'weekly') {
        const bw = Array.isArray(byweekday) ? byweekday : [];
        return bw.includes(day);
      }
      return false;
    })) scheduledTaskIds.push(t.id);
  }
  if (!scheduledTaskIds.length) return { eligible: false, allDone: false };
  const ymd = isoDay(date);
  const { data: comps, error: cErr } = await supabase
    .from('task_completions')
    .select('task_id')
    .eq('user_id', userId)
    .eq('completed_on', ymd)
    .in('task_id', scheduledTaskIds);
  if (cErr) throw cErr;
  const doneSet = new Set((comps || []).map((c: any) => c.task_id));
  return { eligible: true, allDone: scheduledTaskIds.every((id) => doneSet.has(id)) };
}

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createClient();

    // Determine user's timezone for local-day window
    const { data: pref } = await supabase
      .from('user_preferences')
      .select('timezone')
      .eq('user_id', user.id)
      .maybeSingle();
    const userTz = (pref as any)?.timezone || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';
    const ymdInTZ = (d: Date, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    const now = new Date();
    const localTodayYmd = ymdInTZ(now, userTz);
    const localTodayAtUtcMidnight = new Date(`${localTodayYmd}T00:00:00Z`);
    const yesterday = new Date(localTodayAtUtcMidnight.getTime() - 24 * 60 * 60 * 1000);
    const yKey = isoDay(yesterday); // matches finalize

    // Check if yesterday already counted or revived
    const { data: yRowData, error: yErr } = await supabase
      .from('life_streak_days')
      .select('day, counted, revived')
      .eq('user_id', user.id)
      .eq('day', yKey)
      .maybeSingle();
    if (yErr) throw yErr;
    if (yRowData) {
      if (yRowData.counted || yRowData.revived) {
        return NextResponse.json({ error: 'Already counted' }, { status: 409 });
      }
      // else it's a missed row; allow revive to proceed
    }

    // Ensure yesterday was an eligible day with at least one scheduled task but not all completed
    const { eligible, allDone } = await allTasksCompletedForDate(supabase, user.id, yesterday);
    if (!eligible) return NextResponse.json({ error: 'No scheduled tasks to revive' }, { status: 400 });
    if (allDone) return NextResponse.json({ error: 'Day already complete' }, { status: 409 });

    const cost = 10;
    // Get diamonds balance
    const { data: prog, error: pErr } = await supabase
      .from('user_progress')
      .select('diamonds')
      .eq('user_id', user.id)
      .maybeSingle();
    if (pErr) throw pErr;
    const diamonds = prog?.diamonds ?? 0;
    if (diamonds < cost) return NextResponse.json({ error: 'Insufficient diamonds' }, { status: 402 });

    // Perform atomic updates: deduct diamonds, ledger, insert/update life_streak_days
    // Supabase JS client lacks multi-op transaction; emulate with sequential ops assuming RLS and constraints
    const { error: uErr } = await supabase.rpc('perform_life_streak_revive', { p_user_id: user.id, p_day: yKey, p_cost: cost });
    if (uErr) {
      // Fallback if RPC not present: do best-effort sequential with minimal race risk
      const { error: upErr } = await supabase
        .from('user_progress')
        .update({ diamonds: (diamonds - cost) })
        .eq('user_id', user.id);
      if (upErr) throw upErr;
      const { error: ledErr } = await supabase
        .from('diamond_ledger')
        .insert({ user_id: user.id, delta: -cost, reason: 'life_streak_revive' });
      if (ledErr) throw ledErr;
      if (yRowData) {
        // Update existing missed row to counted+revived
        const { error: upDayErr } = await supabase
          .from('life_streak_days')
          .update({ counted: true, revived: true })
          .eq('user_id', user.id)
          .eq('day', yKey);
        if (upDayErr) throw upDayErr;
      } else {
        const { error: insErr } = await supabase
          .from('life_streak_days')
          .insert({ user_id: user.id, day: yKey, counted: true, revived: true });
        if (insErr) throw insErr;
      }
    }

    // Return updated diamonds
    const { data: prog2 } = await supabase
      .from('user_progress')
      .select('diamonds')
      .eq('user_id', user.id)
      .maybeSingle();

    return NextResponse.json({ ok: true, diamonds: prog2?.diamonds ?? Math.max(0, diamonds - cost) });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
