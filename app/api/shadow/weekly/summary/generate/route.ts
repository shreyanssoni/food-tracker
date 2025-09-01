import { NextResponse } from 'next/server';
import { requireUser } from '@/utils/auth';
import { createClient } from '@/utils/supabase/server';

// Phase 7: Weekly summarizer + reset/carryover
// Computes this week's summary in user's timezone and upserts into weekly_summaries
export async function POST() {
  try {
    const user = await requireUser();
    const supabase = createClient();

    // timezone
    let tz = 'UTC';
    try {
      const { data: pref } = await supabase
        .from('user_preferences')
        .select('timezone')
        .eq('user_id', user.id)
        .maybeSingle();
      if (pref?.timezone) tz = String(pref.timezone);
    } catch {}

    // Get local week range [Mon..Sun] for "now" in tz
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(now);
    const y = Number(parts.find(p=>p.type==='year')?.value);
    const m = Number(parts.find(p=>p.type==='month')?.value);
    const d = Number(parts.find(p=>p.type==='day')?.value);
    const localDate = new Date(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T00:00:00`);
    const dow = (localDate.getDay() + 6) % 7; // 0=Mon ... 6=Sun
    const weekStartLocal = new Date(localDate.getTime() - dow * 86400000);
    const weekEndLocal = new Date(weekStartLocal.getTime() + 6 * 86400000);
    const fmtDate = (dt: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt);
    const week_start = fmtDate(weekStartLocal);
    const week_end = fmtDate(weekEndLocal);

    // Pull daily rows within [week_start, week_end]
    const { data: daily, error } = await supabase
      .from('shadow_progress_daily')
      .select('date, user_distance, shadow_distance, lead')
      .eq('user_id', user.id)
      .gte('date', week_start)
      .lte('date', week_end)
      .order('date', { ascending: true });
    if (error) throw error;

    const rows = daily || [];
    const user_total = rows.reduce((a,r)=>a+Number(r.user_distance||0), 0);
    const shadow_total = rows.reduce((a,r)=>a+Number(r.shadow_distance||0), 0);
    let wins = 0, losses = 0;
    for (const r of rows) {
      const lead = Number(r.lead || 0);
      if (lead < 0) wins++; // user ahead
      else if (lead > 0) losses++; // shadow ahead
    }

    // Carryover: simple heuristic, positive if user is behind over the week
    const carryover = Math.max(0, shadow_total - user_total);

    // Upsert weekly summary; weekly_summaries.user_id is text FK to app_users(id)
    const payload = {
      user_id: user.id, // assuming app_users(id) equals auth.uid() text; adjust if mapping exists
      week_start,
      week_end,
      user_total,
      shadow_total,
      wins,
      losses,
      carryover,
      meta: {},
    } as any;

    // Try insert; on conflict (user_id, week_start) update
    const { error: insErr } = await supabase
      .from('weekly_summaries')
      .upsert(payload, { onConflict: 'user_id,week_start' });
    if (insErr) throw insErr;

    return NextResponse.json({ ok: true, summary: { week_start, week_end, user_total, shadow_total, wins, losses, carryover } });
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
