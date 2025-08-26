import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { sendWebPush, type WebPushSubscription } from '@/utils/push';

// ---- Time helpers (timezone-aware, mirrored from other routes) ----
function todayInTimezone(tz: string): string {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(new Date()); // YYYY-MM-DD
  } catch { return new Date().toISOString().slice(0,10); }
}

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

function weekdayIndexFor(ymd: string, tz: string): number {
  try {
    const base = new Date(ymd + 'T12:00:00Z');
    const fmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz });
    const wk = fmt.format(base);
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[wk] ?? new Date(ymd).getDay();
  } catch { return new Date(ymd).getDay(); }
}

function minutesDiff(aMin: number, bMin: number) {
  // difference b - a in minutes normalized to [-720, 720]
  let d = bMin - aMin;
  if (d > 720) d -= 1440;
  if (d < -720) d += 1440;
  return d;
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

    // Distinct timezones
    const { data: tzRows, error: tzErr } = await supabase.from('user_preferences').select('timezone');
    if (tzErr) throw tzErr;
    const tzs = Array.from(new Set((tzRows || []).map((r: any) => String(r?.timezone || '').trim()).filter(Boolean)));
    const finalTzs = tzs.length ? tzs : [process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata'];

    const results: Array<{ timezone: string; ran: boolean; considered: number; notified: number }> = [];

    // Lead window: notify about tasks starting in ~10–15 minutes
    const LEAD_MIN = 15;
    const WINDOW_MIN = 5;

    for (const tz of finalTzs) {
      const todayLocal = todayInTimezone(tz);
      const { hour, minute } = hourMinuteInTimezone(tz);
      const nowMins = hour * 60 + minute;
      const targetStart = (nowMins + (LEAD_MIN - WINDOW_MIN)) % 1440; // now + 10
      const targetEnd = (nowMins + LEAD_MIN) % 1440; // now + 15
      const dow = weekdayIndexFor(todayLocal, tz);

      // Users in timezone
      const { data: users, error: uErr } = await supabase
        .from('user_preferences')
        .select('user_id')
        .eq('timezone', tz);
      if (uErr) throw uErr;
      const userIds = (users || []).map((r: any) => r.user_id);
      if (!userIds.length) { results.push({ timezone: tz, ran: true, considered: 0, notified: 0 }); continue; }

      // Active tasks for these users
      const { data: tasks, error: tErr } = await supabase
        .from('tasks')
        .select('id, user_id, title, active')
        .in('user_id', userIds);
      if (tErr) throw tErr;
      const activeTasks = (tasks || []).filter(t => t.active);
      const taskIds = activeTasks.map((t: any) => t.id);
      if (!taskIds.length) { results.push({ timezone: tz, ran: true, considered: 0, notified: 0 }); continue; }

      // Schedules for these tasks
      const { data: scheds, error: sErr } = await supabase
        .from('task_schedules')
        .select('task_id, frequency, byweekday, at_time, start_date, end_date, timezone')
        .in('task_id', taskIds);
      if (sErr) throw sErr;

      // Group schedules by task
      const schedulesByTask: Record<string, any[]> = {};
      for (const s of scheds || []) {
        (schedulesByTask[s.task_id] = schedulesByTask[s.task_id] || []).push(s);
      }

      // Completions today (skip already done tasks)
      const { data: comps, error: cErr } = await supabase
        .from('task_completions')
        .select('task_id, user_id')
        .in('task_id', taskIds)
        .eq('completed_on', todayLocal);
      if (cErr) throw cErr;
      const completedByUser: Record<string, Set<string>> = {};
      for (const c of comps || []) {
        const set = (completedByUser[c.user_id] = completedByUser[c.user_id] || new Set());
        set.add(c.task_id);
      }

      // Determine upcoming tasks within window
      type Upcoming = { user_id: string; task_id: string; title: string };
      const upcoming: Upcoming[] = [];
      const consideredTaskIds = new Set<string>();

      for (const t of activeTasks) {
        const arr = schedulesByTask[t.id] || [];
        if (!arr.length) continue;

        // Skip if already completed today by that user
        if (completedByUser[t.user_id]?.has(t.id)) continue;

        const inWindow = arr.some((s: any) => {
          // Date bounds
          const start_ok = !s.start_date || todayLocal >= s.start_date;
          const end_ok = !s.end_date || todayLocal <= s.end_date;
          if (!start_ok || !end_ok) return false;
          // Frequency match
          if (s.frequency === 'weekly') {
            const by = Array.isArray(s.byweekday) ? s.byweekday : [];
            if (!by.includes(dow)) return false;
          } else if (s.frequency !== 'daily') {
            return false;
          }
          // at_time should be like HH:MM
          const at: string = String(s.at_time || '').slice(0,5);
          if (!/^\d{2}:\d{2}$/.test(at)) return false;
          const [h, m] = at.split(':').map((x: string) => parseInt(x, 10));
          const schedMins = (h * 60 + m) % 1440;
          const diff = minutesDiff(nowMins, schedMins); // how many mins until sched
          // Window: 10..15 minutes ahead
          return diff >= (LEAD_MIN - WINDOW_MIN) && diff <= LEAD_MIN;
        });

        if (inWindow) {
          upcoming.push({ user_id: t.user_id, task_id: t.id, title: t.title || 'Upcoming task' });
          consideredTaskIds.add(t.id);
        }
      }

      // Dedupe per user and respect last-sent window (avoid spam)
      const byUser = new Map<string, Upcoming[]>();
      for (const u of upcoming) byUser.set(u.user_id, (byUser.get(u.user_id) || []).concat([u]));

      // Check recent sends in last 60 minutes (best-effort; if table lacks created_at, this will be ignored by DB)
      const toSend: Array<{ user_id: string; tasks: Upcoming[] }> = [];
      if (byUser.size) {
        const userList = Array.from(byUser.keys());
        let recentlySent: Set<string> = new Set();
        try {
          const oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          const { data: recents } = await supabase
            .from('push_sends')
            .select('user_id, slot, created_at')
            .in('user_id', userList)
            .eq('slot', 'task_pre')
            .gte('created_at', oneHourAgoIso);
          for (const r of recents || []) recentlySent.add(r.user_id);
        } catch {}

        for (const uid of userList) {
          if (recentlySent.has(uid)) continue; // skip if we pinged recently
          toSend.push({ user_id: uid, tasks: byUser.get(uid) || [] });
        }
      }

      // Fetch push subscriptions for recipients
      let countNotified = 0;
      if (toSend.length) {
        const userIdsToSend = toSend.map(x => x.user_id);
        const { data: subs, error: subErr } = await supabase
          .from('push_subscriptions')
          .select('user_id, endpoint, p256dh, auth, expiration_time')
          .in('user_id', userIdsToSend);
        if (subErr) throw subErr;

        for (const entry of toSend) {
          const userSubs = (subs || []).filter(s => s.user_id === entry.user_id);
          if (!userSubs.length) continue;
          const topTask = entry.tasks[0];
          const more = entry.tasks.length - 1;
          const title = more > 0 ? `Upcoming: ${topTask.title} +${more}` : `Upcoming: ${topTask.title}`;
          const body = more > 0 ? `Starts in ~15 min. You have ${entry.tasks.length} tasks soon.` : 'Starts in ~15 min.';
          const url = '/tasks';

          for (const s of userSubs) {
            const subscription: WebPushSubscription = {
              endpoint: s.endpoint,
              expirationTime: s.expiration_time ?? null,
              keys: { p256dh: s.p256dh, auth: s.auth },
            };
            const res = await sendWebPush(subscription, { title, body, url });
            const success = res.ok;
            await supabase.from('push_sends').insert({
              user_id: entry.user_id,
              slot: 'task_pre',
              title,
              body,
              url,
              success,
              status_code: success ? 201 : (res as any)?.statusCode ?? null,
            });
            if (!success && ((res as any)?.statusCode === 404 || (res as any)?.statusCode === 410 || (res as any)?.statusCode === 403)) {
              await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
            }
          }

          // Focused message
          await supabase.from('user_messages').insert({ user_id: entry.user_id, title, body, url });

          countNotified += 1;
        }
      }

      results.push({ timezone: tz, ran: true, considered: byUser.size, notified: countNotified });
    }

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    console.error('tasks/reminders/run error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
