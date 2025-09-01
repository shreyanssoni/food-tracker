import { NextResponse } from 'next/server';
import { requireUser } from '@/utils/auth';
import { createClient } from '@/utils/supabase/server';

// Phase 2A: Duplicate shadow routine instances for TODAY based on user's tasks ordering/anchors
export async function POST() {
  try {
    const user = await requireUser();
    const supabase = createClient();

    // Resolve timezone
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
      // Compose local midnight string and parse in tz via Date constructor best-effort
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

    // Fetch shadow_tasks joined with tasks for ordering/anchor
    const { data: rows, error: rowsErr } = await supabase
      .from('shadow_tasks')
      .select('id, task_id, status, tasks!inner(id, title, time_anchor, order_hint, active, created_at)')
      .eq('shadow_id', profile.id);
    if (rowsErr) throw rowsErr;

    const active = (rows || []).filter((r: any) => (r.status === 'active') && (r.tasks?.active ?? true));

    // Order tasks similar to state API
    const anchorOrder = ['morning','midday','evening','night','anytime'];
    const sorted = active.sort((a: any, b: any) => {
      const aA = String(a.tasks?.time_anchor || 'anytime');
      const bA = String(b.tasks?.time_anchor || 'anytime');
      const ao = anchorOrder.indexOf(aA);
      const bo = anchorOrder.indexOf(bA);
      if (ao !== bo) return ao - bo;
      const ah = a.tasks?.order_hint == null ? Number.POSITIVE_INFINITY : Number(a.tasks?.order_hint);
      const bh = b.tasks?.order_hint == null ? Number.POSITIVE_INFINITY : Number(b.tasks?.order_hint);
      if (ah !== bh) return ah - bh;
      return new Date(a.tasks?.created_at).getTime() - new Date(b.tasks?.created_at).getTime();
    });

    // Base times and spacing
    const baseTimes: Record<string, [number, number]> = {
      morning: [9, 0],
      midday: [13, 0],
      evening: [18, 0],
      night: [21, 0],
      anytime: [15, 0],
    };
    const spacingMinutes = 15;
    const durationMinutes = 10; // per instance planned duration

    // Group by anchor in order and produce planned times in user's tz converted to UTC timestamps
    type InstanceRow = { shadow_task_id: string; planned_start_at: string; planned_end_at: string; planned_date_local: string };
    const instances: InstanceRow[] = [];

    const local0 = toLocalMidnight(tz);
    const toUtcIso = (hours: number, minutes: number) => {
      const startLocal = new Date(local0.getTime());
      startLocal.setHours(hours, minutes, 0, 0);
      const endLocal = new Date(startLocal.getTime() + durationMinutes * 60000);
      return { start: startLocal.toISOString(), end: endLocal.toISOString() };
    };

    const anchorBuckets: Record<string, any[]> = { morning: [], midday: [], evening: [], night: [], anytime: [] };
    for (const r of sorted) {
      const a = String(r.tasks?.time_anchor || 'anytime');
      (anchorBuckets[a] ||= []).push(r);
    }
    for (const a of anchorOrder) {
      const bucket = anchorBuckets[a] || [];
      const [bh, bm] = baseTimes[a];
      for (let i = 0; i < bucket.length; i++) {
        const { start, end } = toUtcIso(bh, bm + i * spacingMinutes);
        instances.push({ shadow_task_id: bucket[i].id, planned_start_at: start, planned_end_at: end, planned_date_local: dayStr });
      }
    }

    // Skip existing instances for today
    const { data: existing } = await supabase
      .from('shadow_task_instances')
      .select('id, shadow_task_id')
      .eq('planned_date_local', dayStr);
    const existingSet = new Set((existing || []).map((e: any) => e.shadow_task_id));
    const toInsert = instances.filter((i) => !existingSet.has(i.shadow_task_id));

    let inserted = 0;
    if (toInsert.length) {
      const { error: insErr } = await supabase.from('shadow_task_instances').insert(toInsert as any);
      if (insErr) throw insErr;
      inserted = toInsert.length;
    }

    return NextResponse.json({ ok: true, planned_date_local: dayStr, created_instances: inserted, total_candidates: instances.length });
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
