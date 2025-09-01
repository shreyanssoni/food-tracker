import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getCurrentUser } from '@/utils/auth';
import { getShadowConfig } from '@/utils/shadow/config';

function todayInTz(tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date());
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient();
    const admin = createAdminClient();
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

    const day = todayInTz(tz);

    // Fetch today's commit
    const { data: commit, error: cErr } = await supabase
      .from('shadow_progress_commits')
      .select('day, delta, decision_kind, target_today, completed_today, payload, created_at')
      .eq('user_id', user.id)
      .eq('day', day)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!commit) return NextResponse.json({ ok: false, reason: 'no_commit' }, { status: 200 });
    if (commit.decision_kind === 'noop') return NextResponse.json({ ok: false, reason: 'noop' }, { status: 200 });

    // Rate limiting using user_messages
    // Count messages sent today and get latest timestamp
    const startISO = `${day}T00:00:00.000Z`; // UTC compare is approximate; ok for soft limit
    const { data: msgsToday } = await admin
      .from('user_messages')
      .select('id, created_at')
      .eq('user_id', user.id)
      .gte('created_at', startISO);

    const countToday = (msgsToday || []).length;
    if (countToday >= (cfg.max_notifications_per_day || 10)) {
      return NextResponse.json({ ok: false, reason: 'rate_limit_daily' }, { status: 200 });
    }

    // Min spacing
    const latest = (msgsToday || []).sort((a: any, b: any) => (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))[0];
    if (latest) {
      const lastMs = new Date(latest.created_at).getTime();
      const nowMs = Date.now();
      const minGap = (cfg.min_seconds_between_notifications || 900) * 1000;
      if (nowMs - lastMs < minGap) {
        return NextResponse.json({ ok: false, reason: 'rate_limit_spacing' }, { status: 200 });
      }
    }

    // Build message
    const dir = commit.delta < 0 ? 'behind' : 'ahead';
    const abs = Math.abs(Number(commit.delta || 0));
    let title = 'Keep pace today';
    let body = `Target ${commit.target_today}, done ${commit.completed_today}. You are ${dir} by ${abs}.`;
    if (commit.decision_kind === 'boost') {
      title = 'On a roll!';
      body = `You are ahead by ${abs}. Consider tackling a stretch task.`;
    } else if (commit.decision_kind === 'slowdown') {
      title = 'It’s okay to slow down';
      body = `You are behind by ${abs}. Try a small win to recover momentum.`;
    } else if (commit.decision_kind === 'nudge') {
      title = commit.delta < 0 ? 'One more to go' : 'Nice pace';
      body = commit.delta < 0 ? 'Finish one quick task to hit your target.' : 'Optional extra if you feel good.';
    }

    // Insert message
    const { data: ins, error: mErr } = await admin
      .from('user_messages')
      .insert({ user_id: user.id, title, body, url: '/shadow' })
      .select('id')
      .maybeSingle();
    if (mErr) throw mErr;

    return NextResponse.json({ ok: true, message_id: ins?.id, title, body });
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
