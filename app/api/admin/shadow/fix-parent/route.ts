import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

// POST /api/admin/shadow/fix-parent
// Body: { task_ids: string[] }
// Runs public.shadow_fix_link_parent(uuid) for each provided user task id
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient();

    // Admin gate (allow in dev; require is_sys_admin in other envs)
    const { data: meRow } = await supabase
      .from('app_users')
      .select('is_sys_admin')
      .eq('id', me.id)
      .maybeSingle();

    if (process.env.NODE_ENV !== 'development' && !meRow?.is_sys_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const taskIds: string[] = Array.isArray(body?.task_ids) ? body.task_ids : [];
    if (!taskIds.length) return NextResponse.json({ error: 'task_ids[] required' }, { status: 400 });

    const results: { task_id: string; fixed: number | null; error?: string }[] = [];
    for (const id of taskIds) {
      try {
        const { data, error } = await supabase.rpc('shadow_fix_link_parent', { p_user_task_id: id });
        if (error) throw error;
        results.push({ task_id: id, fixed: (data as unknown as number) ?? 0 });
      } catch (e: any) {
        results.push({ task_id: id, fixed: null, error: e?.message || 'rpc failed' });
      }
    }

    return NextResponse.json({ count: results.length, results });
  } catch (e: any) {
    console.error('admin shadow fix-parent error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
