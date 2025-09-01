import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getShadowConfig, logDryRun } from '@/utils/shadow/config';

// POST /api/cron/shadow/run-today-all
// Secured by header: x-cron-secret === process.env.CRON_SECRET
export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-cron-secret');
    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = createAdminClient();

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

        await logDryRun(u.id, 'race_update', { tz, day, completed_today, target_today, delta, completedTaskIds, batch: true, cron: true });

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
          payload: { tz, completedTaskIds, batch: true, cron: true },
        } as any;

        // Upsert commit
        const { error: upErr } = await admin
          .from('shadow_progress_commits')
          .upsert(commit, { onConflict: 'user_id,day' });
        if (upErr) throw upErr;

        await logDryRun(u.id, 'pace_adapt', commit);

        // ---- Compute schedule-aligned metrics for persistence ----
        // Load tasks
        const { data: tasks } = await admin
          .from('tasks')
          .select('id, title, time_anchor, order_hint, owner_type, created_at, active')
          .eq('user_id', u.id)
          .order('created_at', { ascending: true });
        const baseTasks = (tasks || []).filter((t: any) => (t.active ?? true) && (t.owner_type ?? 'user') === 'user');

        // Group by anchors
        const anchorOrder = ['morning', 'midday', 'evening', 'night', 'anytime'];
        const sorted = [...baseTasks].sort((a: any, b: any) => {
          const aA = String(a.time_anchor || 'anytime');
          const bA = String(b.time_anchor || 'anytime');
          const ao = anchorOrder.indexOf(aA);
          const bo = anchorOrder.indexOf(bA);
          if (ao !== bo) return ao - bo;
          const ah = a.order_hint == null ? Number.POSITIVE_INFINITY : Number(a.order_hint);
          const bh = b.order_hint == null ? Number.POSITIVE_INFINITY : Number(b.order_hint);
          if (ah !== bh) return ah - bh;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });

        const grouped: Record<string, any[]> = { morning: [], midday: [], evening: [], night: [], anytime: [] };
        for (const t of sorted) {
          const key = (t.time_anchor as string) || 'anytime';
          grouped[key as keyof typeof grouped].push({ id: t.id, title: t.title, order_hint: t.order_hint ?? null });
        }

        // Build schedule in user's tz with event overrides
        const baseTimes: Record<string, [number, number]> = {
          morning: [9, 0],
          midday: [13, 0],
          evening: [18, 0],
          night: [21, 0],
          anytime: [15, 0],
        };
        const spacingMinutes = 15;
        const schedMinutes = new Map<string, number>();

        const minuteOf = (iso: string, tzStr: string) => {
          const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tzStr, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
          const h = Number(parts.find(p => p.type === 'hour')?.value || '0');
          const m = Number(parts.find(p => p.type === 'minute')?.value || '0');
          return h * 60 + m;
        };
        const partsNow = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
        const hh = Number(partsNow.find(p => p.type === 'hour')?.value || '0');
        const mm = Number(partsNow.find(p => p.type === 'minute')?.value || '0');
        const nowMin = hh * 60 + mm;

        const { data: evs } = await admin
          .from('events')
          .select('due_start, due_end, routine_item_id, user_id')
          .eq('user_id', u.id)
          .order('due_start', { ascending: true })
          .limit(100);
        // Keep only events that fall on the user's current day (tz)
        const sameDay = (iso: string | null | undefined, tzStr: string) => {
          if (!iso) return false;
          const d = new Date(iso);
          const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tzStr, year: 'numeric', month: '2-digit', day: '2-digit' });
          const today = fmt.format(new Date());
          return fmt.format(d) === today;
        };
        const eventsToday = (evs || []).filter((e: any) => sameDay((e as any).due_end || (e as any).due_start, tz));
        const eventOverride = new Map<string, number>();
        for (const e of eventsToday) {
          const taskId = e.routine_item_id ? String(e.routine_item_id) : null;
          const when = (e as any).due_end || (e as any).due_start;
          if (taskId && when) eventOverride.set(taskId, minuteOf(when, tz));
        }
        for (const anchor of ['morning','midday','evening','night','anytime'] as const) {
          const items = grouped[anchor];
          const [h, m] = baseTimes[anchor];
          const baseMin = h * 60 + m;
          for (let i = 0; i < items.length; i++) {
            const tId = String(items[i].id);
            const fallback = baseMin + i * spacingMinutes;
            const override = eventOverride.get(tId);
            schedMinutes.set(tId, typeof override === 'number' ? override : fallback);
          }
        }

        // Collect completion timestamps for pace
        const { data: compRows } = await admin
          .from('task_completions')
          .select('task_id, created_at, completed_on')
          .eq('user_id', u.id)
          .eq('completed_on', day);
        const completedAtMap = new Map<string, string>();
        const completedTimes: Date[] = [];
        for (const r of (compRows || [])) {
          if (r.task_id && r.created_at) {
            completedAtMap.set(String(r.task_id), String(r.created_at));
            completedTimes.push(new Date(String(r.created_at)));
          }
        }

        // Signed time_saved_minutes
        let time_saved_minutes = 0;
        const minutesOfInTz = (ts: string, tzStr: string) => {
          const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tzStr, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ts));
          const h = Number(parts.find(p => p.type === 'hour')?.value || '0');
          const m = Number(parts.find(p => p.type === 'minute')?.value || '0');
          return h * 60 + m;
        };
        for (const [taskId, userTs] of completedAtMap.entries()) {
          const sMin = schedMinutes.get(taskId);
          if (typeof sMin === 'number') {
            const uMin = minutesOfInTz(userTs, tz);
            const diffMin = sMin - uMin; // positive => earlier than schedule
            time_saved_minutes += diffMin;
          }
        }

        // Pace consistency (0..1)
        let pace_consistency: number | null = null;
        if (completedTimes.length >= 2) {
          completedTimes.sort((a, b) => a.getTime() - b.getTime());
          const intervals: number[] = [];
          for (let i = 1; i < completedTimes.length; i++) {
            intervals.push((completedTimes[i].getTime() - completedTimes[i - 1].getTime()) / 60000);
          }
          const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
          if (mean > 0) {
            const variance = intervals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / intervals.length;
            const std = Math.sqrt(variance);
            const cv = std / mean;
            pace_consistency = Math.max(0, 1 - cv);
          } else {
            pace_consistency = 0;
          }
        }

        // Delta and speeds
        let shadow_done_now = 0;
        let shadow_done_in_60 = 0;
        const nowPlus60 = nowMin + 60;
        for (const [_taskId, schedMin] of schedMinutes.entries()) {
          if (schedMin <= nowMin) shadow_done_now += 1;
          if (schedMin <= nowPlus60) shadow_done_in_60 += 1;
        }
        const user_done_now = completedAtMap.size;
        const delta_now = user_done_now - shadow_done_now;
        let user_speed_now = 0;
        if (completedTimes.length) {
          const oneHourAgo = Date.now() - 60 * 60000;
          user_speed_now = completedTimes.filter((d) => d.getTime() >= oneHourAgo).length;
        }
        const shadow_speed_now = Math.max(0, shadow_done_in_60 - shadow_done_now);

        // Upsert daily aggregates row
        const nowIso = new Date().toISOString();
        const upsert = {
          user_id: u.id,
          date: day,
          user_distance: user_done_now,
          shadow_distance: shadow_done_now,
          lead: delta_now,
          user_speed_avg: null,
          shadow_speed_target: target_today,
          time_saved_minutes,
          pace_consistency,
          delta_now,
          user_speed_now,
          shadow_speed_now,
          last_computed_at: nowIso,
        } as any;
        await admin
          .from('shadow_progress_daily')
          .upsert(upsert, { onConflict: 'user_id,date' });

        // Persist shadow pass markers (auto-completions) for tasks whose scheduled minute has passed
        try {
          const passedTaskIds: string[] = [];
          for (const [taskId, schedMin] of schedMinutes.entries()) {
            if (typeof schedMin === 'number' && schedMin <= nowMin) passedTaskIds.push(String(taskId));
          }
          if (passedTaskIds.length) {
            const rowsToUpsert = passedTaskIds.map((tid) => ({
              user_id: u.id,
              task_id: tid,
              date: day,
              expected_at: nowIso,
            }));
            await admin.from('shadow_passes').upsert(rowsToUpsert as any, { onConflict: 'user_id,task_id,date' });
          }
        } catch (e) {
          await logDryRun(u.id, 'pace_adapt', { kind: 'shadow_passes_upsert_error', message: (e as any)?.message || 'failed' });
        }

        // Rate-limited nudge
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
    console.error('cron run-today-all error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
