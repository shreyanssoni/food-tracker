import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

// Reuse helpers from single-goal route implementation (duplicated here for isolation)
function dateKeyLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function startOfWeek(d: Date) {
  const date = new Date(d);
  const dow = date.getDay();
  date.setDate(date.getDate() - dow);
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

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createClient();

    const url = new URL(req.url);
    const idsParam = url.searchParams.get('ids');

    // If ids not provided, fetch all user goals to compute summaries
    let goalIds: string[] = [];
    if (idsParam && idsParam.trim()) {
      goalIds = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      const { data: gRows, error: gErr } = await supabase
        .from('goals')
        .select('id')
        .eq('user_id', user.id);
      if (gErr) throw gErr;
      goalIds = (gRows || []).map((g: any) => String(g.id));
    }

    if (goalIds.length === 0) {
      return NextResponse.json({ items: [], max: { dailyCurrent: 0, dailyLongest: 0, weeklyCurrent: 0, weeklyLongest: 0 } });
    }

    const today = new Date();
    const overall = { dailyCurrent: 0, dailyLongest: 0, weeklyCurrent: 0, weeklyLongest: 0 };
    const items: Array<{ id: string; streaks: { dailyCurrent: number; dailyLongest: number; consecutiveWeeks: number; longestWeeks: number }, currentWeekCount: number, currentWeekQuota: number }> = [];

    for (const id of goalIds) {
      // Ensure goal belongs to user
      const { data: goal, error: gErr } = await supabase
        .from('goals')
        .select('id, user_id, title, deadline, start_date')
        .eq('id', id)
        .single();
      if (gErr) continue;
      if (!goal || goal.user_id !== user.id) continue;

      // Fetch links
      const { data: links, error: lErr } = await supabase
        .from('goal_tasks')
        .select('task_id, template_id')
        .eq('goal_id', id);
      if (lErr) continue;

      const taskIds = Array.from(new Set((links || []).map((l: any) => l.task_id))).filter(Boolean);
      const tmplIds = Array.from(new Set((links || []).map((l: any) => l.template_id))).filter(Boolean);

      // Templates -> weekly quota estimate
      let week_quota = 0;
      let tmpls: Array<{ id: string; frequency: string; times_per_period: number; byweekday: number[] | null }> = [];
      if (tmplIds.length) {
        const { data: tmplsData } = await supabase
          .from('goal_task_templates')
          .select('id, frequency, times_per_period, byweekday')
          .in('id', tmplIds as any);
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
      if (!week_quota || isNaN(week_quota)) week_quota = 1;

      // Window for 12 weeks
      const end = endOfWeek(today);
      const start = startOfWeek(new Date(today));
      start.setDate(start.getDate() - 7 * 11);

      // Completions
      let completions: Array<{ task_id: string; completed_on: string }> = [];
      if (taskIds.length) {
        const { data: comps } = await supabase
          .from('task_completions')
          .select('task_id, completed_on')
          .eq('user_id', user.id)
          .in('task_id', taskIds as any)
          .gte('completed_on', dateKeyLocal(start))
          .lte('completed_on', dateKeyLocal(end));
        completions = (comps || []) as any;
      }

      // Aggregate per-day
      const dayCounts = new Map<string, number>();
      const completedByDay = new Map<string, Set<string>>();
      for (const c of completions) {
        const d = String((c as any).completed_on);
        dayCounts.set(d, (dayCounts.get(d) || 0) + 1);
        const set = completedByDay.get(d) || new Set<string>();
        set.add(String((c as any).task_id));
        completedByDay.set(d, set);
      }

      // Revives
      const { data: reviveRows } = await supabase
        .from('goal_streak_revives')
        .select('revive_date')
        .eq('goal_id', goal.id)
        .eq('user_id', user.id)
        .gte('revive_date', dateKeyLocal(start))
        .lte('revive_date', dateKeyLocal(end));
      const revivedSet = new Set<string>((reviveRows || []).map((r: any) => String(r.revive_date)));

      // Schedules
      let schedules: Array<{ task_id: string; frequency: string; byweekday: number[] | null; start_date?: string | null; end_date?: string | null }> = [];
      if (taskIds.length) {
        const { data: schedRows } = await supabase
          .from('task_schedules')
          .select('task_id, frequency, byweekday, start_date, end_date')
          .in('task_id', taskIds as any);
        schedules = (schedRows || []) as any;
      }

      function isDueOnDay(s: any, date: Date) {
        const freq = String(s.frequency || 'weekly');
        const d0 = new Date(date); d0.setHours(0,0,0,0);
        if (s.start_date) {
          const sd = new Date(String(s.start_date)); sd.setHours(0,0,0,0);
          if (d0 < sd) return false;
        }
        if (s.end_date) {
          const ed = new Date(String(s.end_date)); ed.setHours(23,59,59,999);
          if (d0 > ed) return false;
        }
        if (freq === 'daily') return true;
        const by: number[] = Array.isArray(s.byweekday) ? s.byweekday : [];
        if (freq === 'weekly' || freq === 'custom') {
          return by.includes(d0.getDay());
        }
        if (freq === 'once') {
          if (!s.start_date) return false;
          const sd = new Date(String(s.start_date)); sd.setHours(0,0,0,0);
          return d0.getTime() === sd.getTime();
        }
        return false;
      }

      // Build current week days and aggregate current week progress
      const curStart = startOfWeek(today);
      const curEnd = endOfWeek(today);
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      let currentWeekCount = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(curStart);
        d.setDate(curStart.getDate() + i);
        const key = dateKeyLocal(d);
        const revived = revivedSet.has(key);
        const due = schedules.reduce((acc, s) => acc + (isDueOnDay(s, d) ? 1 : 0), 0);
        const completedUnique = (completedByDay.get(key)?.size) || 0;
        // cap per-day counted completions by due to align with weekly quota semantics
        const effectiveCompleted = Math.min(completedUnique, Math.max(0, due));
        currentWeekCount += revived ? Math.max(1, effectiveCompleted) : effectiveCompleted;
        const completed = revived || (due === 0) || (completedUnique >= due);
        void (completed || d >= startOfToday);
      }

      // Build 12 week window
      const weeks: Array<{ success: boolean } > = [];
      const wStart = startOfWeek(start);
      const wEnd = endOfWeek(end);
      const totalWeeks = Math.max(1, Math.round((wEnd.getTime() - wStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
      const goalStart = new Date(String(goal.start_date)); goalStart.setHours(0,0,0,0);
      function effectiveQuotaForWeek(ws: Date, we: Date) {
        if (we < goalStart) return 0;
        if (ws >= goalStart) return week_quota;
        let eff = 0;
        for (const t of tmpls) {
          const freq = String((t as any).frequency || 'weekly');
          const times = Number((t as any).times_per_period || 0);
          if (freq === 'weekly') eff += times;
          else if (freq === 'daily') {
            let daysCount = 0;
            for (let i = 0; i < 7; i++) {
              const d = new Date(ws);
              d.setDate(ws.getDate() + i);
              d.setHours(0,0,0,0);
              if (d >= goalStart) daysCount++;
            }
            eff += daysCount * times;
          } else {
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
      for (let w = 0; w < totalWeeks; w++) {
        const ws = new Date(wStart);
        ws.setDate(wStart.getDate() + w * 7);
        const we = new Date(ws);
        we.setDate(ws.getDate() + 6);
        const wsAdj = goalStart > ws ? goalStart : ws;
        let cnt = 0;
        for (let i = 0; i < 7; i++) {
          const d = new Date(ws);
          d.setDate(ws.getDate() + i);
          if (d < wsAdj) continue;
          const dk = dateKeyLocal(d);
          cnt += dayCounts.get(dk) || 0;
        }
        const effQuota = effectiveQuotaForWeek(wsAdj, we);
        weeks.push({ success: effQuota > 0 ? cnt >= effQuota : false });
      }

      // Weekly streaks
      let consecutiveWeeks = 0;
      for (let i = weeks.length - 1; i >= 0; i--) {
        if (weeks[i].success) consecutiveWeeks++; else break;
      }
      let longestWeeks = 0; let curW = 0;
      for (let i = 0; i < weeks.length; i++) {
        if (weeks[i].success) curW++; else { if (curW > longestWeeks) longestWeeks = curW; curW = 0; }
      }
      if (curW > longestWeeks) longestWeeks = curW;

      // Daily streaks
      const day0 = new Date(today); day0.setHours(0,0,0,0);
      const goalStart0 = new Date(goalStart);
      let dailyCurrent = 0;
      for (let i = 0; ; i++) {
        const d = new Date(day0); d.setDate(day0.getDate() - i); if (d < goalStart0) break;
        const key = dateKeyLocal(d); const c = (dayCounts.get(key) || 0) > 0 || revivedSet.has(key);
        if (c) dailyCurrent += 1; else break;
      }
      let dailyLongest = 0; let curRun = 0;
      const scanStart = new Date(start);
      for (let i = 0; ; i++) {
        const d = new Date(scanStart); d.setDate(scanStart.getDate() + i); d.setHours(0,0,0,0);
        if (d > end) break; if (d < goalStart0) continue;
        const key = dateKeyLocal(d); const c = (dayCounts.get(key) || 0) > 0 || revivedSet.has(key);
        if (c) { curRun++; dailyLongest = Math.max(dailyLongest, curRun); } else { curRun = 0; }
      }

      // Update aggregates and push
      overall.dailyCurrent = Math.max(overall.dailyCurrent, dailyCurrent);
      overall.dailyLongest = Math.max(overall.dailyLongest, dailyLongest);
      overall.weeklyCurrent = Math.max(overall.weeklyCurrent, consecutiveWeeks);
      overall.weeklyLongest = Math.max(overall.weeklyLongest, longestWeeks);
      // Compute effective quota for current week window
      const curWsAdj = goalStart > curStart ? goalStart : curStart;
      const currentWeekQuota = effectiveQuotaForWeek(curWsAdj, curEnd);
      items.push({ id: String(goal.id), streaks: { dailyCurrent, dailyLongest, consecutiveWeeks, longestWeeks }, currentWeekCount, currentWeekQuota });
    }

    return NextResponse.json({ items, max: overall });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
