import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

// POST /api/cron/shadow/generate-events-today-all
// Secured via header: x-cron-secret === process.env.CRON_SECRET
// Creates today's shadow_task_instances for all users with a shadow_profile
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();

  const todayInTz = (tzStr: string, d = new Date()) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: tzStr, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

  const toLocalMidnight = (tzStr: string) => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tzStr, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(now);
    const y = Number(parts.find(p=>p.type==='year')?.value);
    const m = Number(parts.find(p=>p.type==='month')?.value);
    const d = Number(parts.find(p=>p.type==='day')?.value);
    return new Date(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T00:00:00`);
  };

  try {
    // Load all shadow profiles
    const { data: profiles, error: pErr } = await admin
      .from('shadow_profile')
      .select('id, user_id')
      .limit(100000);
    if (pErr) throw pErr;

    const results: any[] = [];

    for (const sp of profiles || []) {
      try {
        const userId = String(sp.user_id);
        // Resolve timezone
        let tz = String(process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata');
        try {
          const { data: pref } = await admin
            .from('user_preferences')
            .select('timezone')
            .eq('user_id', userId)
            .maybeSingle();
          if (pref?.timezone) tz = String(pref.timezone);
        } catch {}

        const dayStr = todayInTz(tz);

        // Load mirrors joined with tasks
        const { data: rows, error: rowsErr } = await admin
          .from('shadow_tasks')
          .select('id, status, task_id, tasks!inner(id, title, time_anchor, order_hint, active, created_at)')
          .eq('shadow_id', sp.id);
        if (rowsErr) throw rowsErr;

        const getTask = (r: any) => (Array.isArray(r?.tasks) ? r.tasks[0] : r?.tasks);
        const active = (rows || []).filter((r: any) => (r.status === 'active') && ((getTask(r)?.active ?? true)));

        const anchorOrder = ['morning','midday','evening','night','anytime'];
        const baseTimes: Record<string, [number, number]> = {
          morning: [9, 0],
          midday: [13, 0],
          evening: [18, 0],
          night: [21, 0],
          anytime: [15, 0],
        };
        const spacingMinutes = 15;
        const durationMinutes = 10;

        const sorted = active.sort((a: any, b: any) => {
          const at = getTask(a);
          const bt = getTask(b);
          const aA = String(at?.time_anchor || 'anytime');
          const bA = String(bt?.time_anchor || 'anytime');
          const ao = anchorOrder.indexOf(aA);
          const bo = anchorOrder.indexOf(bA);
          if (ao !== bo) return ao - bo;
          const ah = at?.order_hint == null ? Number.POSITIVE_INFINITY : Number(at?.order_hint);
          const bh = bt?.order_hint == null ? Number.POSITIVE_INFINITY : Number(bt?.order_hint);
          if (ah !== bh) return ah - bh;
          return new Date(at?.created_at).getTime() - new Date(bt?.created_at).getTime();
        });

        const local0 = toLocalMidnight(tz);
        const toUtcIso = (hours: number, minutes: number) => {
          const startLocal = new Date(local0.getTime());
          startLocal.setHours(hours, minutes, 0, 0);
          const endLocal = new Date(startLocal.getTime() + durationMinutes * 60000);
          return { start: startLocal.toISOString(), end: endLocal.toISOString() };
        };

        const anchorBuckets: Record<string, any[]> = { morning: [], midday: [], evening: [], night: [], anytime: [] };
        for (const r of sorted) {
          const t = getTask(r);
          const a = String(t?.time_anchor || 'anytime');
          (anchorBuckets[a] ||= []).push(r);
        }

        const candidates: any[] = [];
        for (const a of anchorOrder) {
          const bucket = anchorBuckets[a] || [];
          const [bh, bm] = baseTimes[a];
          for (let i = 0; i < bucket.length; i++) {
            const { start, end } = toUtcIso(bh, bm + i * spacingMinutes);
            candidates.push({
              shadow_task_id: bucket[i].id,
              planned_start_at: start,
              planned_end_at: end,
              planned_date_local: dayStr,
              status: 'pending',
              progress: 0,
            });
          }
        }

        // Insert missing candidates
        const { data: existing } = await admin
          .from('shadow_task_instances')
          .select('id, shadow_task_id')
          .eq('planned_date_local', dayStr);
        const existingSet = new Set((existing || []).map((e: any) => e.shadow_task_id));
        const toInsert = candidates.filter((i) => !existingSet.has(i.shadow_task_id));
        if (toInsert.length) {
          const { error: insErr } = await admin.from('shadow_task_instances').insert(toInsert as any);
          if (insErr) throw insErr;
        }

        results.push({ user_id: userId, inserted: toInsert.length });
      } catch (e: any) {
        results.push({ user_id: String((sp as any)?.user_id), error: e?.message || 'failed' });
      }
    }

    return NextResponse.json({ ok: true, total_profiles: (profiles || []).length, results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
