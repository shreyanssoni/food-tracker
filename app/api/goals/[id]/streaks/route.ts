import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

function startOfWeek(d: Date) {
  const date = new Date(d);
  const dow = date.getDay();
  const diffToMonday = (dow + 6) % 7;
  date.setDate(date.getDate() - diffToMonday);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfWeek(d: Date) {
  const start = startOfWeek(d);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createClient();

    // Ensure goal belongs to user
    const { data: goal, error: gErr } = await supabase
      .from('goals')
      .select('id, user_id, title, deadline, start_date')
      .eq('id', params.id)
      .single();
    if (gErr) throw gErr;
    if (!goal || goal.user_id !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Fetch tasks linked to this goal
    const { data: links, error: lErr } = await supabase
      .from('goal_tasks')
      .select('task_id, template_id')
      .eq('goal_id', params.id);
    if (lErr) throw lErr;

    const taskIds = Array.from(new Set((links || []).map((l: any) => l.task_id))).filter(Boolean);

    // Fetch templates to compute weekly quota
    const tmplIds = Array.from(new Set((links || []).map((l: any) => l.template_id))).filter(Boolean);
    let week_quota = 0;
    let tmpls: Array<{ id: string; frequency: string; times_per_period: number; byweekday: number[] | null }> = [];
    if (tmplIds.length) {
      const { data: tmplsData, error: tErr } = await supabase
        .from('goal_task_templates')
        .select('id, frequency, times_per_period, byweekday')
        .in('id', tmplIds as any);
      if (tErr) throw tErr;
      tmpls = (tmplsData || []) as any;
      for (const t of tmpls) {
        const freq = String((t as any).frequency || 'weekly');
        const times = Number((t as any).times_per_period || 0);
        if (freq === 'weekly') week_quota += times;
        else if (freq === 'daily') week_quota += times * 7;
        else {
          const days = Array.isArray((t as any).byweekday) ? (t as any).byweekday.length : 0;
          week_quota += Math.max(0, days) * times;
        }
      }
    }
    // Fallback quota
    if (!week_quota || isNaN(week_quota)) week_quota = 1;

    // Date range: last 12 weeks
    const today = new Date();
    const end = endOfWeek(today);
    const start = startOfWeek(new Date(today));
    start.setDate(start.getDate() - 7 * 11);

    // Fetch completions in range for these tasks
    let completions: Array<{ task_id: string; completed_on: string }> = [];
    if (taskIds.length) {
      const { data: comps, error: cErr } = await supabase
        .from('task_completions')
        .select('task_id, completed_on')
        .eq('user_id', user.id)
        .in('task_id', taskIds as any)
        .gte('completed_on', start.toISOString().slice(0, 10))
        .lte('completed_on', end.toISOString().slice(0, 10));
      if (cErr) throw cErr;
      completions = (comps || []) as any;
    }

    // Aggregate by day
    const dayCounts = new Map<string, number>();
    for (const c of completions) {
      const d = String((c as any).completed_on);
      dayCounts.set(d, (dayCounts.get(d) || 0) + 1);
    }

    // Fetch revived days for this goal/user in the window
    const { data: reviveRows, error: rErr } = await supabase
      .from('goal_streak_revives')
      .select('revive_date')
      .eq('goal_id', goal.id)
      .eq('user_id', user.id)
      .gte('revive_date', start.toISOString().slice(0, 10))
      .lte('revive_date', end.toISOString().slice(0, 10));
    if (rErr) throw rErr;
    const revivedSet = new Set<string>((reviveRows || []).map((r: any) => String(r.revive_date)));

    // Build days for current week
    const curStart = startOfWeek(today);
    const days: Array<{ date: string; completed: boolean; revived: boolean; missed: boolean; count: number }> = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(curStart);
      d.setDate(curStart.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const cnt = dayCounts.get(key) || 0;
      const revived = revivedSet.has(key);
      const completed = cnt > 0 || revived;
      // Only mark missed if the day is on/after the goal start and not in the future
      const missed = !completed && d >= new Date(String(goal.start_date)) && d <= new Date();
      days.push({ date: key, completed, revived, missed, count: cnt });
    }

    // Helper to compute effective quota for a given week considering goal.start_date
    const goalStart = new Date(String(goal.start_date));
    goalStart.setHours(0,0,0,0);
    function effectiveQuotaForWeek(ws: Date, we: Date) {
      // If the whole week is before the goal start, nothing is required
      if (we < goalStart) return 0;
      // If week starts on/after goal start -> full quota
      if (ws >= goalStart) return week_quota;
      // Partial week: only count days >= goalStart according to template rules
      let eff = 0;
      for (const t of tmpls) {
        const freq = String((t as any).frequency || 'weekly');
        const times = Number((t as any).times_per_period || 0);
        if (freq === 'weekly') {
          // Weekly goal doesn't depend on specific days; still achievable after start
          eff += times;
        } else if (freq === 'daily') {
          // Count number of days in this week that are on/after goalStart
          let daysCount = 0;
          for (let i = 0; i < 7; i++) {
            const d = new Date(ws);
            d.setDate(ws.getDate() + i);
            d.setHours(0,0,0,0);
            if (d >= goalStart) daysCount++;
          }
          eff += daysCount * times;
        } else {
          // custom: only consider scheduled weekdays that occur on/after goalStart
          const by = Array.isArray((t as any).byweekday) ? (t as any).byweekday as number[] : [];
          let count = 0;
          for (let i = 0; i < 7; i++) {
            const d = new Date(ws);
            d.setDate(ws.getDate() + i);
            d.setHours(0,0,0,0);
            if (d >= goalStart && by.includes(d.getDay())) count++;
          }
          eff += count * times;
        }
      }
      return eff;
    }

    // Build week successes for last 12 weeks
    const weeks: Array<{ weekStart: string; success: boolean; count: number }> = [];
    const wStart = new Date(start);
    for (let w = 0; w < 12; w++) {
      const ws = new Date(wStart);
      ws.setDate(wStart.getDate() + w * 7);
      const we = new Date(ws);
      we.setDate(ws.getDate() + 6);
      const keyStart = ws.toISOString().slice(0, 10);
      let cnt = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(ws);
        d.setDate(ws.getDate() + i);
        const dk = d.toISOString().slice(0, 10);
        cnt += dayCounts.get(dk) || 0;
      }
      const effQuota = effectiveQuotaForWeek(ws, we);
      weeks.push({ weekStart: keyStart, success: effQuota > 0 ? cnt >= effQuota : false, count: cnt });
    }

    // Compute streaks
    let consecutiveWeeks = 0;
    for (let i = weeks.length - 1; i >= 0; i--) {
      if (weeks[i].success) consecutiveWeeks++;
      else break;
    }
    let longest = 0;
    let cur = 0;
    for (let i = 0; i < weeks.length; i++) {
      if (weeks[i].success) cur++;
      else { if (cur > longest) longest = cur; cur = 0; }
    }
    if (cur > longest) longest = cur;

    // Compute current week's effective quota for display (this prevents Sunday-before-start from blocking)
    const curWs = startOfWeek(today);
    const curWe = endOfWeek(today);
    const week_quota_current = effectiveQuotaForWeek(curWs, curWe) || week_quota;

    // Daily streaks (overall since goal start): count consecutive days up to today where completed or revived
    const day0 = new Date(today);
    day0.setHours(0,0,0,0);
    let dailyStreakCurrent = 0;
    for (let i = 0; ; i++) {
      const d = new Date(day0);
      d.setDate(day0.getDate() - i);
      if (d < goalStart) break;
      const key = d.toISOString().slice(0, 10);
      const c = (dayCounts.get(key) || 0) > 0 || revivedSet.has(key);
      if (c) dailyStreakCurrent += 1; else break;
    }
    // Longest daily streak in the 12-week window (approx; optional)
    let longestDaily = 0; let curRun = 0;
    const scanStart = new Date(start);
    for (let i = 0; ; i++) {
      const d = new Date(scanStart);
      d.setDate(scanStart.getDate() + i);
      d.setHours(0,0,0,0);
      if (d > end) break;
      if (d < goalStart) continue;
      const key = d.toISOString().slice(0, 10);
      const c = (dayCounts.get(key) || 0) > 0 || revivedSet.has(key);
      if (c) { curRun++; longestDaily = Math.max(longestDaily, curRun); }
      else { curRun = 0; }
    }

    // Revive eligibility: if yesterday was missed (no completion, no revive), allow spending 20 diamonds within 24h
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    yesterday.setHours(0,0,0,0);
    const yKey = yesterday.toISOString().slice(0, 10);
    const yCompleted = (dayCounts.get(yKey) || 0) > 0;
    const yRevived = revivedSet.has(yKey);
    const within24h = (day0.getTime() - yesterday.getTime()) <= 24*60*60*1000 && day0 > yesterday;
    const canRevive = within24h && !yCompleted && !yRevived && (yesterday >= goalStart);

    return NextResponse.json({
      goal: { id: goal.id, title: goal.title },
      week_quota,
      week_quota_current,
      days,
      weeks,
      streaks: { consecutiveWeeks, longest, dailyCurrent: dailyStreakCurrent, dailyLongest: longestDaily },
      revive: { eligible: canRevive, date: canRevive ? yKey : null, cost: 20 },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
