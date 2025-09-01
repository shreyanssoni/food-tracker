import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

// GET /api/admin/shadow/mirror-status?user_id=<uuid>&limit=100
// Returns per-user-task mirror status summary using v_task_mirror_status
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
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
    if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

    // Join the view to tasks to expose task metadata and filter by user
    const { data, error } = await supabase
      .from('v_task_mirror_status')
      .select('user_task_id')
      .limit(limit);
    if (error) throw error;

    const ids = (data || []).map((r: any) => r.user_task_id);
    if (!ids.length) return NextResponse.json({ items: [] });

    const { data: tasks, error: tErr } = await supabase
      .from('tasks')
      .select('id, user_id, title, owner_type, created_at')
      .in('id', ids as any)
      .eq('user_id', user_id);
    if (tErr) throw tErr;

    // Re-fetch status for only filtered tasks to ensure alignment
    const { data: status, error: sErr } = await supabase
      .from('v_task_mirror_status')
      .select('user_task_id, mirrors_by_parent, candidate_mirrors_by_title')
      .in('user_task_id', (tasks || []).map((t: any) => t.id) as any);
    if (sErr) throw sErr;

    const sMap = new Map<string, any>((status || []).map((x: any) => [x.user_task_id, x]));
    const items = (tasks || []).map((t: any) => ({
      id: t.id,
      title: t.title,
      created_at: t.created_at,
      mirrors_by_parent: sMap.get(t.id)?.mirrors_by_parent ?? 0,
      candidate_mirrors_by_title: sMap.get(t.id)?.candidate_mirrors_by_title ?? 0,
    }));

    return NextResponse.json({ items });
  } catch (e: any) {
    console.error('admin mirror-status error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
