import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Utility to get YYYY-MM-DD string for a given Date in UTC
function isoDayUTC(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Derive YYYY-MM-DD for "today" in a specific timezone
function todayInTimezone(tz: string): string {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(new Date()); // en-CA => YYYY-MM-DD
  } catch {
    return isoDayUTC(new Date());
  }
}

// Derive local hour (0-23) and minute (0-59) in timezone
function hourMinuteInTimezone(tz: string): { hour: number; minute: number } {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
    const parts = fmt.formatToParts(new Date());
    const h = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    return { hour: h, minute: m };
  } catch {
    const d = new Date();
    return { hour: d.getUTCHours(), minute: d.getUTCMinutes() };
  }
}

// Compute weekday index (0=Sun..6=Sat) for a given YYYY-MM-DD in a timezone
function weekdayIndexFor(ymd: string, tz: string): number {
  try {
    const base = new Date(ymd + 'T12:00:00Z'); // noon UTC to avoid DST edge issues
    const fmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz });
    const wk = fmt.format(base);
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[wk] ?? new Date(ymd).getDay();
  } catch {
    return new Date(ymd).getDay();
  }
}

// Returns true if the task is scheduled on the given local date string (YYYY-MM-DD) per its schedule row for that timezone
function taskScheduledOnYmd(schedule: any, ymd: string, tz: string, dow: number): boolean {
  if (!schedule) return false;
  const { frequency, byweekday, start_date, end_date } = schedule || {};
  if (start_date && ymd < start_date) return false;
  if (end_date && ymd > end_date) return false;
  if (frequency === 'daily') return true;
  if (frequency === 'weekly') {
    const arr = Array.isArray(byweekday) ? byweekday : [];
    return arr.includes(dow);
  }
  return false; // ignore custom
}

async function allTasksCompletedForYmd(supabase: any, userId: string, ymd: string, tz: string) {
  // Fetch tasks and schedules
  const { data: tasks, error: tErr } = await supabase
    .from('tasks')
    .select('id, active')
    .eq('user_id', userId);
  if (tErr) throw tErr;
  const ids = (tasks || []).map((t: any) => t.id);

  // Fetch schedules
  let schedulesByTask: Record<string, any[]> = {};
  if (ids.length) {
    const { data: scheds, error: sErr } = await supabase
      .from('task_schedules')
      .select('*')
      .in('task_id', ids);
    if (sErr) throw sErr;
    for (const s of scheds || []) {
      schedulesByTask[s.task_id] = schedulesByTask[s.task_id] || [];
      schedulesByTask[s.task_id].push(s);
    }
  }

  const dow = weekdayIndexFor(ymd, tz);

  // Determine scheduled tasks on ymd in tz
  const scheduledTaskIds: string[] = [];
  for (const t of tasks || []) {
    if (!t.active) continue;
    const arr = schedulesByTask[t.id] || [];
    if (arr.some((s: any) => taskScheduledOnYmd(s, ymd, tz, dow))) scheduledTaskIds.push(t.id);
  }
  if (scheduledTaskIds.length === 0) return { eligible: false, allDone: false };

  // Completions on ymd
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

export async function GET(req: NextRequest) {
  try {
    // Auth like push scheduler
    const secret = process.env.CRON_SECRET;
    const provided = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret') || '';
    const isVercelCron = req.headers.get('x-vercel-cron');
    if (!isVercelCron && secret && secret !== provided) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createClient();

    // Determine target timezones
    const { data: tzRows, error: tzErr } = await supabase
      .from('user_preferences')
      .select('timezone');
    if (tzErr) throw tzErr;
    const uniqTzs = Array.from(new Set((tzRows || []).map((r: any) => String(r?.timezone || '').trim()).filter(Boolean)));
    const tzs = uniqTzs.length ? uniqTzs : [process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata'];

    const results: Array<{ timezone: string; ran: boolean; checkedUsers: number; countedDays: number }> = [];

    for (const tz of tzs) {
      const { hour } = hourMinuteInTimezone(tz);
      // Run at local 00:00 to finalize previous day EOD
      if (hour !== 0) { results.push({ timezone: tz, ran: false, checkedUsers: 0, countedDays: 0 }); continue; }

      const todayLocal = todayInTimezone(tz);
      // Compute yesterday local by creating Date from todayLocal and subtracting 1 day
      const yDate = new Date(todayLocal + 'T00:00:00Z');
      const yMinus1 = new Date(yDate.getTime() - 24 * 60 * 60 * 1000);
      const yKey = isoDayUTC(yMinus1);

      // Fetch users in this timezone
      const { data: users, error: uErr } = await supabase
        .from('user_preferences')
        .select('user_id')
        .eq('timezone', tz);
      if (uErr) throw uErr;
      const ids = (users || []).map((r: any) => r.user_id);
      if (!ids.length) { results.push({ timezone: tz, ran: true, checkedUsers: 0, countedDays: 0 }); continue; }

      let counted = 0;
      for (const uid of ids) {
        // Skip if already recorded (counted or revived)
        const { data: dayRow, error: dErr } = await supabase
          .from('life_streak_days')
          .select('day')
          .eq('user_id', uid)
          .eq('day', yKey)
          .maybeSingle();
        if (dErr) throw dErr;
        if (dayRow) continue;

        const { eligible, allDone } = await allTasksCompletedForYmd(supabase, uid, yKey, tz);
        if (eligible && allDone) {
          const { error: insErr } = await supabase
            .from('life_streak_days')
            .insert({ user_id: uid, day: yKey, counted: true, revived: false });
          if (!insErr) counted += 1;
          // Ignore unique violation if any
        }
      }

      results.push({ timezone: tz, ran: true, checkedUsers: ids.length, countedDays: counted });
    }

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    console.error('life-streak run-eod error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
