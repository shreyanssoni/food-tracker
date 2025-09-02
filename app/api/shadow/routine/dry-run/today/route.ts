import { NextResponse } from 'next/server';
import { requireUser } from '@/utils/auth';
import { createClient } from '@/utils/supabase/server';

// Phase 2B: Compute today's routine plan without persisting (dry-run)
export async function GET() {
  try {
    const user = await requireUser();
    const supabase = createClient();

    // timezone
    let tz = 'UTC';
    try {
      const { data: pref } = await supabase
        .from('user_preferences')
        .select('timezone')
        .eq('user_id', user.id)
        .maybeSingle();
      if (pref?.timezone) tz = String(pref.timezone);
    } catch {}

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

    const dayStr = todayInTz(tz);

    // Ensure shadow_profile exists
    const { data: profile } = await supabase
      .from('shadow_profile')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!profile) return NextResponse.json({ error: 'Missing shadow_profile. Run /api/shadow/audit/fix first.' }, { status: 400 });

    // active shadow_tasks joined to tasks
    const { data: rows, error: rowsErr } = await supabase
      .from('shadow_tasks')
      .select('id, task_id, status, tasks!inner(id, title, time_anchor, order_hint, active, created_at)')
      .eq('shadow_id', profile.id);
    if (rowsErr) throw rowsErr;

    // Supabase nested join arrays helper
    const getTask = (r: any) => (Array.isArray(r?.tasks) ? r.tasks[0] : r?.tasks);

    const active = (rows || []).filter((r: any) => (r.status === 'active') && (getTask(r)?.active ?? true));

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

    // order stable
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

    // build preview instances (no insert)
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

    const preview: any[] = [];
    for (const a of anchorOrder) {
      const bucket = anchorBuckets[a] || [];
      const [bh, bm] = baseTimes[a];
      for (let i = 0; i < bucket.length; i++) {
        const { start, end } = toUtcIso(bh, bm + i * spacingMinutes);
        preview.push({
          planned_date_local: dayStr,
          planned_start_at: start,
          planned_end_at: end,
          anchor: a,
          shadow_task_id: bucket[i].id,
          task_id: bucket[i].task_id,
          title: getTask(bucket[i])?.title,
          order_hint: getTask(bucket[i])?.order_hint ?? null,
        });
      }
    }

    return NextResponse.json({ ok: true, timezone: tz, planned_date_local: dayStr, count: preview.length, preview });
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
