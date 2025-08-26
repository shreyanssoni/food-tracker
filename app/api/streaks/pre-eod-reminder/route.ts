import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { sendWebPush, type WebPushSubscription } from '@/utils/push';

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

function taskScheduledOnYmd(schedule: any, ymd: string, tz: string, dow: number): boolean {
  if (!schedule) return false;
  const { frequency, byweekday, start_date, end_date } = schedule || {};
  if (start_date && ymd < start_date) return false;
  if (end_date && ymd > end_date) return false;
  if (frequency === 'daily') return true;
  if (frequency === 'weekly') {
    const arr = Array.isArray(byweekday) ? byweekday : [];
    return arr.includes(dow);
  }
  if (frequency === 'once') {
    return !!start_date && ymd === start_date;
  }
  return false;
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

    const results: Array<{ timezone: string; ran: boolean; notified: number }> = [];

    for (const tz of finalTzs) {
      const { hour, minute } = hourMinuteInTimezone(tz);
      // Target near 23:59 local. Allow a small window to support 5-min cron: minutes 55..59.
      if (!(hour === 23 && minute >= 55)) { results.push({ timezone: tz, ran: false, notified: 0 }); continue; }

      const todayLocal = todayInTimezone(tz);
      const dow = weekdayIndexFor(todayLocal, tz);

      // Fetch users in timezone
      const { data: users, error: uErr } = await supabase
        .from('user_preferences')
        .select('user_id')
        .eq('timezone', tz);
      if (uErr) throw uErr;
      const userIds = (users || []).map((r: any) => r.user_id);
      if (!userIds.length) { results.push({ timezone: tz, ran: true, notified: 0 }); continue; }

      // Fetch tasks and schedules for these users
      const { data: tasks, error: tErr } = await supabase
        .from('tasks')
        .select('id, user_id, active')
        .in('user_id', userIds);
      if (tErr) throw tErr;
      const taskIds = (tasks || []).filter(t => t.active).map((t: any) => t.id);

      let schedulesByTask: Record<string, any[]> = {};
      if (taskIds.length) {
        const { data: scheds, error: sErr } = await supabase
          .from('task_schedules')
          .select('*')
          .in('task_id', taskIds);
        if (sErr) throw sErr;
        for (const s of scheds || []) {
          schedulesByTask[s.task_id] = schedulesByTask[s.task_id] || [];
          schedulesByTask[s.task_id].push(s);
        }
      }

      // Completions today
      let completionsByUser: Record<string, Set<string>> = {};
      if (taskIds.length) {
        const { data: comps, error: cErr } = await supabase
          .from('task_completions')
          .select('task_id, user_id')
          .in('task_id', taskIds)
          .eq('completed_on', todayLocal);
        if (cErr) throw cErr;
        for (const c of comps || []) {
          const set = (completionsByUser[c.user_id] = completionsByUser[c.user_id] || new Set());
          set.add(c.task_id);
        }
      }

      // Determine which users are at risk: they have at least one scheduled task today that is not completed
      const toNotify: string[] = [];
      const tasksByUser = new Map<string, any[]>();
      for (const t of tasks || []) {
        if (!t.active) continue;
        tasksByUser.set(t.user_id, (tasksByUser.get(t.user_id) || []).concat([t]));
      }
      for (const uid of userIds) {
        const list = tasksByUser.get(uid) || [];
        const doneSet = completionsByUser[uid] || new Set<string>();
        const hasMissRisk = list.some((task) => {
          const arr = schedulesByTask[task.id] || [];
          const scheduled = arr.some((s: any) => taskScheduledOnYmd(s, todayLocal, tz, dow));
          if (!scheduled) return false;
          return !doneSet.has(task.id);
        });
        if (hasMissRisk) toNotify.push(uid);
      }

      let notified = 0;
      if (toNotify.length) {
        // Subscriptions for those users
        const { data: subs, error: subErr } = await supabase
          .from('push_subscriptions')
          .select('user_id, endpoint, p256dh, auth, expiration_time')
          .in('user_id', toNotify);
        if (subErr) throw subErr;

        // Send push + create focused message
        for (const uid of toNotify) {
          const userSubs = (subs || []).filter(s => s.user_id === uid);
          const payload = {
            title: "You're about to miss your streak",
            body: 'Finish today’s tasks to keep it alive! Tap to log now.',
            url: '/suggestions',
          };
          for (const s of userSubs) {
            const subscription: WebPushSubscription = {
              endpoint: s.endpoint,
              expirationTime: s.expiration_time ?? null,
              keys: { p256dh: s.p256dh, auth: s.auth },
            };
            const res = await sendWebPush(subscription, payload);
            const success = res.ok;
            await supabase.from('push_sends').insert({
              user_id: uid,
              slot: 'night',
              title: payload.title,
              body: payload.body,
              url: payload.url,
              success,
              status_code: success ? 201 : (res.statusCode ?? null),
            });
            if (!success && (res.statusCode === 404 || res.statusCode === 410 || res.statusCode === 403)) {
              await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
            }
          }
          if (userSubs.length) notified += 1;
          await supabase.from('user_messages').insert({ user_id: uid, title: payload.title, body: payload.body, url: payload.url });
        }
      }

      results.push({ timezone: tz, ran: true, notified });
    }

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    console.error('pre-eod-reminder error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
