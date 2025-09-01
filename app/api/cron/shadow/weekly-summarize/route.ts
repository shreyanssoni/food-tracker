import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

// POST /api/cron/shadow/weekly-summarize  (secured by x-cron-secret)
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET || '';
    const hdr = req.headers.get('x-cron-secret') || '';
    if (!secret || hdr !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    // Determine current week [Mon..Sun] in UTC
    const now = new Date();
    const day = now.getUTCDay(); // 0=Sun..6=Sat
    const deltaToMon = (day + 6) % 7; // days since Monday
    const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    weekStart.setUTCDate(weekStart.getUTCDate() - deltaToMon);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 7); // exclusive

    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    // Fetch distinct users with any progress in the window
    const { data: userRows, error: uerr } = await admin
      .from('shadow_progress_daily')
      .select('user_id')
      .gte('date', weekStartStr)
      .lt('date', weekEndStr);

    if (uerr) throw uerr;

    const distinctUsers = Array.from(new Set((userRows || []).map((r: any) => String(r.user_id)))).map((id) => ({ user_id: id }));
    const results: any[] = [];
    for (const u of distinctUsers) {
      const { data: rows, error } = await admin
        .from('shadow_progress_daily')
        .select('user_distance, shadow_distance')
        .eq('user_id', u.user_id)
        .gte('date', weekStartStr)
        .lt('date', weekEndStr);
      if (error) throw error;

      const user_total = (rows || []).reduce((s: number, r: any) => s + Number(r.user_distance || 0), 0);
      const shadow_total = (rows || []).reduce((s: number, r: any) => s + Number(r.shadow_distance || 0), 0);
      const carryover = Math.max(0, user_total - shadow_total);

      const payload = {
        user_id: u.user_id,
        week_start: weekStartStr,
        week_end: weekEndStr,
        user_total,
        shadow_total,
        wins: 0,
        losses: 0,
        carryover,
        meta: {},
      } as any;

      const { error: upErr } = await admin
        .from('weekly_summaries')
        .upsert(payload, { onConflict: 'user_id,week_start' });
      if (upErr) throw upErr;

      results.push({ user_id: u.user_id, user_total, shadow_total, carryover });
    }

    return NextResponse.json({ ok: true, window: { weekStart: weekStartStr, weekEnd: weekEndStr }, count: distinctUsers.length, results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}
