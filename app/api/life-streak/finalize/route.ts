import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Format YYYY-MM-DD in a given IANA timezone
function ymdInTZ(d: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(d); // en-CA yields YYYY-MM-DD
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret') || '';
  if (secret && secret !== provided) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const tzs: string[] = Array.isArray(body?.timezones) ? body.timezones : [];
    const force: boolean = !!body?.force;
    if (!tzs.length) return NextResponse.json({ error: 'Provide timezones[]' }, { status: 400 });
    const now = new Date();
    const results: any[] = [];
    for (const tz of tzs) {
      const { hour, minute } = hourMinuteInTZ(now, tz);
      const inWindow = (hour === 23 && minute >= 55) || (hour === 0 && minute < 5);
      if (!inWindow && !force) continue;
      const res = await finalizeForTimezone(tz);
      results.push(res);
    }
    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

function hourMinuteInTZ(d: Date, tz: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(d);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  return { hour, minute };
}

// Simplified: a task is scheduled if it's active and any schedule matches the weekday/date bounds
function taskScheduledOn(schedule: any, date: Date): boolean {
  if (!schedule) return false;
  const { frequency, byweekday, start_date, end_date } = schedule;
  const ymd = date.toISOString().slice(0, 10);
  if (start_date && ymd < start_date) return false;
  if (end_date && ymd > end_date) return false;
  if (frequency === 'daily') return true;
  if (frequency === 'weekly') {
    const arr = Array.isArray(byweekday) ? byweekday : [];
    const day = date.getDay();
    return arr.includes(day);
  }
  return false;
}

async function allTasksCompletedForDate(supabase: any, userId: string, date: Date) {
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

  const scheduledTaskIds: string[] = [];
  for (const t of tasks || []) {
    if (!t.active) continue;
    const arr = schedules[t.id] || [];
    if (arr.some((s: any) => taskScheduledOn(s, date))) scheduledTaskIds.push(t.id);
  }
  if (scheduledTaskIds.length === 0) {
    return { eligible: false, allDone: false };
  }
  const ymd = date.toISOString().slice(0, 10);
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

async function finalizeForTimezone(tz: string) {
  const supabase = createClient();
  // get users for this timezone
  const { data: prefs, error } = await supabase
    .from('user_preferences')
    .select('user_id')
    .eq('timezone', tz);
  if (error) throw error;

  const users = (prefs || []).map((p: any) => p.user_id).filter(Boolean);
  const now = new Date();
  // local yesterday ymd in tz
  const localYMDToday = ymdInTZ(now, tz);
  const today = new Date(`${localYMDToday}T00:00:00Z`);
  const localYesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const ymd = localYesterday.toISOString().slice(0, 10);

  let counted = 0, missed = 0, skipped = 0;

  for (const userId of users) {
    // Skip if already recorded
    const { data: existing, error: e1 } = await supabase
      .from('life_streak_days')
      .select('day')
      .eq('user_id', userId)
      .eq('day', ymd)
      .maybeSingle();
    if (e1) throw e1;
    if (existing) { skipped++; continue; }

    const { eligible, allDone } = await allTasksCompletedForDate(supabase, userId, localYesterday);
    if (!eligible) { skipped++; continue; }

    if (allDone) {
      await supabase.from('life_streak_days').insert({ user_id: userId, day: ymd, counted: true, revived: false });
      counted++;
    } else {
      await supabase.from('life_streak_days').insert({ user_id: userId, day: ymd, counted: false, revived: false });
      missed++;
    }
  }

  return { timezone: tz, processed: users.length, counted, missed, skipped };
}

export async function GET(req: NextRequest) {
  // Protect endpoint
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret') || '';
  const isVercelCron = req.headers.get('x-vercel-cron');
  if (!isVercelCron && secret && secret !== provided) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = createClient();
    const { data: rows, error } = await supabase
      .from('user_preferences')
      .select('timezone');
    if (error) throw error;
    const tzs = Array.from(new Set((rows || []).map((r: any) => String(r?.timezone || '').trim()).filter(Boolean)));
    const finalTzs = tzs.length ? tzs : [process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata'];

    const now = new Date();
    const results: any[] = [];

    for (const tz of finalTzs) {
      const { hour, minute } = hourMinuteInTZ(now, tz);
      const inWindow = (hour === 23 && minute >= 55) || (hour === 0 && minute < 5);
      if (!inWindow) continue;
      const res = await finalizeForTimezone(tz);
      results.push(res);
    }

    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
