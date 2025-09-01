import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';
import { getShadowConfig, logDryRun } from '@/utils/shadow/config';

function todayInTz(tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date());
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient();

    // Resolve timezone to compute user's local day string
    let tz = 'Asia/Kolkata';
    try {
      const { data: pref } = await supabase
        .from('user_preferences')
        .select('timezone')
        .eq('user_id', user.id)
        .maybeSingle();
      tz = String(pref?.timezone || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata');
    } catch {}

    const day = todayInTz(tz);

    const { data, error } = await supabase
      .from('shadow_progress_commits')
      .select('id, user_id, day, delta, target_today, completed_today, decision_kind, payload, created_at')
      .eq('user_id', user.id as any)
      .eq('day', day)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error; // ignore No Rows

    return NextResponse.json({ commit: data || null, tz, day });
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient();
    const cfg = await getShadowConfig(user.id);

    // Resolve timezone
    let tz = 'Asia/Kolkata';
    try {
      const { data: pref } = await supabase
        .from('user_preferences')
        .select('timezone')
        .eq('user_id', user.id)
        .maybeSingle();
      tz = String(pref?.timezone || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata');
    } catch {}

    const day = todayInTz(tz); // YYYY-MM-DD

    // Recompute today's base-task completions (exclude shadow-owned)
    const { data: rows, error } = await supabase
      .from('task_completions')
      .select('task_id')
      .eq('user_id', user.id)
      .eq('completed_on', day);
    if (error) throw error;

    const ids = Array.from(new Set((rows || []).map((r: any) => r.task_id)));
    let completedTaskIds: string[] = [];
    if (ids.length) {
      const { data: ts, error: tErr } = await supabase
        .from('tasks')
        .select('id, owner_type')
        .in('id', ids as any);
      if (tErr) throw tErr;
      completedTaskIds = (ts || [])
        .filter((t: any) => (t.owner_type ?? 'user') === 'user')
        .map((t: any) => t.id as string);
    }

    const completed_today = completedTaskIds.length;
    const target_today = Math.max(0, Math.round((cfg.shadow_speed_target ?? cfg.base_speed)));
    const delta = completed_today - target_today;

    // Choose a minimal decision policy
    let decision_kind: 'boost' | 'slowdown' | 'nudge' | 'noop' = 'noop';
    if (delta >= 2) decision_kind = 'boost';
    else if (delta <= -2) decision_kind = 'slowdown';
    else if (delta === -1 || delta === 1) decision_kind = 'nudge';

    const body = await req.json().catch(() => ({}));
    const extra = body?.payload ?? {};

    const commit = {
      user_id: user.id as any,
      day,
      delta,
      target_today,
      completed_today,
      decision_kind,
      payload: { tz, completedTaskIds, ...extra },
    } as any;

    // Upsert on (user_id, day)
    const { error: upErr } = await supabase
      .from('shadow_progress_commits')
      .upsert(commit, { onConflict: 'user_id,day' });
    if (upErr) throw upErr;

    // Upsert daily aggregation for charts/state
    const daily = {
      user_id: user.id as any,
      date: day,
      user_distance: completed_today,
      shadow_distance: target_today,
      lead: delta,
      user_speed_avg: null,
      shadow_speed_target: target_today,
      updated_at: new Date().toISOString(),
    } as any;

    const { error: spdErr } = await supabase
      .from('shadow_progress_daily')
      .upsert(daily, { onConflict: 'user_id,date' });
    if (spdErr) throw spdErr;

    await logDryRun(user.id, 'pace_adapt', commit);

    return NextResponse.json({ ok: true, ...commit });
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
