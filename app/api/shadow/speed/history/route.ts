import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/utils/auth';
import { createClient } from '@/utils/supabase/server';

// GET /api/shadow/speed/history?days=14
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = createClient();
    const url = new URL(req.url);
    const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') || '14', 10)));

    const { data, error } = await supabase
      .from('shadow_progress_daily')
      .select('date, user_speed_avg, shadow_speed_target, user_distance, shadow_distance, lead, difficulty_tier')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(days);

    if (error) throw error;

    const series = (data || []).reverse();
    return NextResponse.json({ days, series });
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
