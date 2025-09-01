import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

// GET /api/admin/shadow/logs?user_id=<uuid>&kind=race_update&day=YYYY-MM-DD&limit=100
// Reads shadow_dry_run_logs with optional filters.
export async function GET(req: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient();
    const { data: meRow } = await supabase
      .from('app_users')
      .select('is_sys_admin')
      .eq('id', me.id)
      .maybeSingle();

    if (process.env.NODE_ENV !== 'development' && !meRow?.is_sys_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(req.url);
    const user_id = url.searchParams.get('user_id');
    const kind = url.searchParams.get('kind') || undefined; // state_snapshot | race_update | pace_adapt
    const day = url.searchParams.get('day') || undefined; // YYYY-MM-DD (UTC day filter start)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);

    if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

    let q = supabase
      .from('shadow_dry_run_logs')
      .select('id, kind, payload, created_at')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (kind) q = q.eq('kind', kind);
    if (day) q = q.gte('created_at', `${day}T00:00:00.000Z`).lte('created_at', `${day}T23:59:59.999Z`);

    const { data, error } = await q;
    if (error) throw error;

    return NextResponse.json({ logs: data || [] });
  } catch (e: any) {
    console.error('admin shadow logs error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
