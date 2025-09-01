import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getCurrentUser } from '@/utils/auth';
import { getShadowConfig, logDryRun } from '@/utils/shadow/config';

function todayInTz(tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date());
}

export async function POST(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient();
    const admin = createAdminClient();
    const cfg = await getShadowConfig(user.id);
    if (!cfg.enabled_race) {
      return NextResponse.json({ ok: false, reason: 'race_disabled' }, { status: 200 });
    }

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

    const day = todayInTz(tz);

    // Compute delta (base tasks only)
    const { data: rows } = await supabase
      .from('task_completions')
      .select('task_id')
      .eq('user_id', user.id)
      .eq('completed_on', day);

    const ids = Array.from(new Set((rows || []).map((r: any) => r.task_id)));
    let completedTaskIds: string[] = [];
    if (ids.length) {
      const { data: ts } = await supabase
        .from('tasks')
        .select('id, owner_type')
        .in('id', ids as any);
      completedTaskIds = (ts || [])
        .filter((t: any) => (t.owner_type ?? 'user') === 'user')
        .map((t: any) => t.id as string);
    }

    const completed_today = completedTaskIds.length;
    const target_today = Math.max(0, Math.round((cfg.shadow_speed_target ?? cfg.base_speed)));
    const delta = completed_today - target_today;

    await logDryRun(user.id, 'race_update', { tz, day, completed_today, target_today, delta, completedTaskIds });

    // Decide and persist commit
    let decision_kind: 'boost' | 'slowdown' | 'nudge' | 'noop' = 'noop';
    if (delta >= 2) decision_kind = 'boost';
    else if (delta <= -2) decision_kind = 'slowdown';
    else if (delta === -1 || delta === 1) decision_kind = 'nudge';

    const commit = {
      user_id: user.id as any,
      day,
      delta,
      target_today,
      completed_today,
      decision_kind,
      payload: { tz, completedTaskIds },
    } as any;

    const { error: upErr } = await supabase
      .from('shadow_progress_commits')
      .upsert(commit, { onConflict: 'user_id,day' });
    if (upErr) throw upErr;

    await logDryRun(user.id, 'pace_adapt', commit);

    // If noop, we are done
    if (decision_kind === 'noop') return NextResponse.json({ ok: true, decision_kind, delta, target_today, completed_today, nudged: false });

    // Rate limits (use admin to read/write user_messages)
    const startISO = `${day}T00:00:00.000Z`;
    const { data: msgsToday } = await admin
      .from('user_messages')
      .select('id, created_at')
      .eq('user_id', user.id)
      .gte('created_at', startISO);

    const countToday = (msgsToday || []).length;
    if (countToday >= (cfg.max_notifications_per_day || 10)) {
      return NextResponse.json({ ok: true, decision_kind, delta, target_today, completed_today, nudged: false, reason: 'rate_limit_daily' });
    }

    const latest = (msgsToday || []).sort((a: any, b: any) => (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))[0];
    if (latest) {
      const lastMs = new Date(latest.created_at).getTime();
      const nowMs = Date.now();
      const minGap = (cfg.min_seconds_between_notifications || 900) * 1000;
      if (nowMs - lastMs < minGap) {
        return NextResponse.json({ ok: true, decision_kind, delta, target_today, completed_today, nudged: false, reason: 'rate_limit_spacing' });
      }
    }

    // Compose message
    const dir = delta < 0 ? 'behind' : 'ahead';
    const abs = Math.abs(Number(delta || 0));
    let title = 'Keep pace today';
    let body = `Target ${target_today}, done ${completed_today}. You are ${dir} by ${abs}.`;
    if (decision_kind === 'boost') {
      title = 'On a roll!';
      body = `You are ahead by ${abs}. Consider tackling a stretch task.`;
    } else if (decision_kind === 'slowdown') {
      title = 'It’s okay to slow down';
      body = `You are behind by ${abs}. Try a small win to recover momentum.`;
    } else if (decision_kind === 'nudge') {
      title = delta < 0 ? 'One more to go' : 'Nice pace';
      body = delta < 0 ? 'Finish one quick task to hit your target.' : 'Optional extra if you feel good.';
    }

    const { data: ins, error: mErr } = await admin
      .from('user_messages')
      .insert({ user_id: user.id, title, body, url: '/shadow' })
      .select('id')
      .maybeSingle();
    if (mErr) throw mErr;

    return NextResponse.json({ ok: true, decision_kind, delta, target_today, completed_today, nudged: true, message_id: ins?.id, title, body });
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
