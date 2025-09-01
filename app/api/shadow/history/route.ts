import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/utils/auth';
import { createClient } from '@/utils/supabase/server';

// Phase 9: Shadow history API
// Returns daily race history plus recent alignment events
// GET /api/shadow/history?days=30
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = createClient();
    const url = new URL(req.url);
    const days = Math.min(180, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10)));

    const [dailyRes, alignRes] = await Promise.all([
      supabase
        .from('shadow_progress_daily')
        .select('date, user_speed_avg, shadow_speed_target, user_distance, shadow_distance, lead, difficulty_tier')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(days),
      supabase
        .from('alignment_log')
        .select('id, shadow_id, user_completion_id, shadow_instance_id, alignment_status, recorded_at')
        .eq('user_id', user.id)
        .order('recorded_at', { ascending: false })
        .limit(200)
    ]);

    if (dailyRes.error) throw dailyRes.error;
    if (alignRes.error) throw alignRes.error;

    const daily = (dailyRes.data || []).reverse();
    const events = alignRes.data || [];
    return NextResponse.json({ days, daily, events });
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
