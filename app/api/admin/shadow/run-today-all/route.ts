import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';
import { getShadowConfig, logDryRun } from '@/utils/shadow/config';

// POST /api/admin/shadow/run-today-all
// Runs the orchestrator (delta -> commit -> nudge) for all users with enabled_race.
// Secured: sysadmin only in non-dev.
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supa = createClient();
    const admin = createAdminClient();

    const { data: meRow } = await supa
      .from('app_users')
      .select('is_sys_admin')
      .eq('id', me.id)
      .maybeSingle();

    if (process.env.NODE_ENV !== 'development' && !meRow?.is_sys_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Identify candidate users
    const { data: cfgRows, error: cErr } = await admin
      .from('shadow_config')
      .select('user_id, enabled_race, shadow_speed_target, base_speed')
      .eq('enabled_race', true);
    if (cErr) throw cErr;

    const users = (cfgRows || []).map((r: any) => ({
      id: r.user_id as string,
      base_speed: r.base_speed,
      shadow_speed_target: r.shadow_speed_target,
    }));

    const results: Array<any> = [];
    for (const u of users) {
      try {
        // Resolve timezone
        let tz = String(process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata');
        try {
          const { data: pref } = await admin
            .from('user_preferences')
            .select('timezone')
            .eq('user_id', u.id)
            .maybeSingle();
          if (pref?.timezone) tz = String(pref.timezone);
        } catch {}

        const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
        const day = fmt.format(new Date());

        // Completions today
        const { data: rows } = await admin
          .from('task_completions')
          .select('task_id')
          .eq('user_id', u.id)
          .eq('completed_on', day);

        const ids = Array.from(new Set((rows || []).map((r: any) => r.task_id)));
        let completedTaskIds: string[] = [];
        if (ids.length) {
          const { data: ts } = await admin
            .from('tasks')
            .select('id, owner_type')
            .in('id', ids as any);
          completedTaskIds = (ts || [])
            .filter((t: any) => (t.owner_type ?? 'user') === 'user')
            .map((t: any) => t.id as string);
        }

        // Target config
        const cfg = await getShadowConfig(u.id);
        const target_today = Math.max(0, Math.round((cfg.shadow_speed_target ?? cfg.base_speed)));
        const completed_today = completedTaskIds.length;
        const delta = completed_today - target_today;

        await logDryRun(u.id, 'race_update', { tz, day, completed_today, target_today, delta, completedTaskIds, batch: true });

        // Decision
        let decision_kind: 'boost' | 'slowdown' | 'nudge' | 'noop' = 'noop';
        if (delta >= 2) decision_kind = 'boost';
        else if (delta <= -2) decision_kind = 'slowdown';
        else if (delta === -1 || delta === 1) decision_kind = 'nudge';

        const commit = {
          user_id: u.id,
          day,
          delta,
          target_today,
          completed_today,
          decision_kind,
          payload: { tz, completedTaskIds, batch: true },
        } as any;

        // Upsert commit (admin bypasses RLS)
        const { error: upErr } = await admin
          .from('shadow_progress_commits')
          .upsert(commit, { onConflict: 'user_id,day' });
        if (upErr) throw upErr;

        await logDryRun(u.id, 'pace_adapt', commit);

        // Consider nudge
        let nudged = false;
        let reason: string | undefined;
        if (decision_kind !== 'noop') {
          const { data: msgsToday } = await admin
            .from('user_messages')
            .select('id, created_at')
            .eq('user_id', u.id)
            .gte('created_at', `${day}T00:00:00.000Z`);

          const countToday = (msgsToday || []).length;
          if (countToday >= (cfg.max_notifications_per_day || 10)) {
            reason = 'rate_limit_daily';
          } else {
            const latest = (msgsToday || []).sort((a: any, b: any) => (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))[0];
            if (latest) {
              const lastMs = new Date(latest.created_at).getTime();
              const nowMs = Date.now();
              const minGap = (cfg.min_seconds_between_notifications || 900) * 1000;
              if (nowMs - lastMs < minGap) reason = 'rate_limit_spacing';
            }
          }

          if (!reason) {
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

            const { error: mErr } = await admin
              .from('user_messages')
              .insert({ user_id: u.id, title, body, url: '/shadow' });
            if (mErr) throw mErr;
            nudged = true;
          }
        }

        results.push({ user_id: u.id, ok: true, decision_kind, delta, target_today, completed_today, nudged, reason });
      } catch (e: any) {
        results.push({ user_id: u.id, ok: false, error: e?.message || 'failed' });
      }
    }

    return NextResponse.json({ ok: true, total: users.length, results });
  } catch (e: any) {
    console.error('run-today-all error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
