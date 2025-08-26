import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

function todayInTimezone(tz: string): string {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(new Date()); // YYYY-MM-DD
  } catch { return new Date().toISOString().slice(0,10); }
}

export async function GET(req: NextRequest) {
  try {
    // Auth: allow either CRON_SECRET or Vercel Cron header
    const secret = process.env.CRON_SECRET;
    const provided = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret') || '';
    const isVercelCron = req.headers.get('x-vercel-cron');
    if (!isVercelCron && secret && secret !== provided) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createClient();

    // Distinct timezones with users
    const { data: tzRows, error: tzErr } = await supabase.from('user_preferences').select('user_id, timezone');
    if (tzErr) throw tzErr;
    const tzByUser = new Map<string, string>();
    for (const r of tzRows || []) {
      if (r.user_id && r.timezone) tzByUser.set(r.user_id, String(r.timezone));
    }

    // Find one-time schedules joined to tasks
    const { data: rows, error: qErr } = await supabase
      .from('task_schedules')
      .select('task_id, frequency, start_date, end_date, timezone, tasks!inner(id, user_id, active)')
      .eq('frequency', 'once');
    if (qErr) throw qErr;

    let toDeactivate: string[] = [];
    for (const r of rows || []) {
      const task = (r as any).tasks;
      if (!task?.active) continue;
      const tz = tzByUser.get(task.user_id) || r.timezone || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';
      const todayLocal = todayInTimezone(tz);
      const lastDay = r.end_date || r.start_date; // one-time: end_date often equals start_date
      if (lastDay && todayLocal > lastDay) {
        toDeactivate.push(task.id);
      }
    }

    toDeactivate = Array.from(new Set(toDeactivate));
    let updated = 0;
    if (toDeactivate.length) {
      const { error: uErr } = await supabase.from('tasks').update({ active: false }).in('id', toDeactivate);
      if (uErr) throw uErr;
      updated = toDeactivate.length;
    }

    return NextResponse.json({ ok: true, deactivated: updated, ids: toDeactivate });
  } catch (e) {
    console.error('tasks/maintenance/once error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
