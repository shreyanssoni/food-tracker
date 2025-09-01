import { NextResponse } from 'next/server';
import { requireUser } from '@/utils/auth';
import { createClient } from '@/utils/supabase/server';

// Phase 6A: Intra-day pace adapter
// Adjust today's shadow_speed_target based on recent user speed
export async function POST() {
  try {
    const user = await requireUser();
    const supabase = createClient();

    // Get today row from shadow_progress_daily
    const { data: todayRow } = await supabase
      .from('shadow_progress_daily')
      .select('date, shadow_speed_target, user_speed_avg')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!todayRow) return NextResponse.json({ error: 'No daily progress row found' }, { status: 404 });

    // Heuristic: pull last 6 hours from commits or fallback to today avg
    let recentSpeed = todayRow.user_speed_avg || 0;
    try {
      const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { data: commits } = await supabase
        .from('shadow_progress_commits')
        .select('user_speed_now, created_at')
        .eq('user_id', user.id)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(30);
      const speeds = (commits || []).map(c => Number(c.user_speed_now)).filter((v) => Number.isFinite(v));
      if (speeds.length) recentSpeed = speeds.reduce((a,b)=>a+b,0)/speeds.length;
    } catch {}

    const currentTarget = Number(todayRow.shadow_speed_target || 0);
    const alpha = 0.5; // be responsive intra-day
    const minClamp = 0.5;
    const maxClamp = 5.0;

    // Blend and clamp
    let newTarget = alpha * recentSpeed + (1 - alpha) * currentTarget;
    newTarget = Math.max(minClamp, Math.min(maxClamp, Number(newTarget.toFixed(2))));

    // Update today's target
    const { error: upErr } = await supabase
      .from('shadow_progress_daily')
      .update({ shadow_speed_target: newTarget })
      .eq('user_id', user.id)
      .eq('date', todayRow.date);
    if (upErr) throw upErr;

    return NextResponse.json({ ok: true, date: todayRow.date, shadow_speed_target: newTarget, recent_user_speed: recentSpeed });
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
