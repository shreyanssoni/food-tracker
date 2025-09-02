import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

// POST /api/cron/shadow/audit-fix-all
// Secured via header: x-cron-secret === process.env.CRON_SECRET
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();

  try {
    // Find users who have any active user-owned tasks
    const { data: taskUsers, error: tuErr } = await admin
      .from('tasks')
      .select('user_id, owner_type, active')
      .neq('user_id', null)
      .limit(100000);
    if (tuErr) throw tuErr;

    const userIds = Array.from(new Set((taskUsers || [])
      .filter((t: any) => (t.owner_type ?? 'user') === 'user' && (t.active ?? true))
      .map((t: any) => String(t.user_id))));

    const results: any[] = [];

    for (const userId of userIds) {
      try {
        // Ensure shadow_profile
        let shadowId: string | null = null;
        {
          const { data: sp } = await admin
            .from('shadow_profile')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle();
          if (sp?.id) {
            shadowId = sp.id as string;
          } else {
            const { data: ins } = await admin
              .from('shadow_profile')
              .insert({ user_id: userId })
              .select('id')
              .single();
            shadowId = ins?.id || null;
          }
        }
        if (!shadowId) throw new Error('failed_create_shadow_profile');

        // Load active user tasks
        const { data: tasks } = await admin
          .from('tasks')
          .select('id, active, owner_type')
          .eq('user_id', userId)
          .order('created_at', { ascending: true });
        const activeTasks = (tasks || []).filter((t: any) => (t.active ?? true) && (t.owner_type ?? 'user') === 'user');

        // Existing mirrors
        const { data: mirrors } = await admin
          .from('shadow_tasks')
          .select('id, task_id')
          .eq('shadow_id', shadowId);

        const mirrored = new Set((mirrors || []).map((m: any) => String(m.task_id)));
        const toInsert = activeTasks
          .filter((t: any) => !mirrored.has(String(t.id)))
          .map((t: any) => ({ shadow_id: shadowId, task_id: t.id, status: 'active' }));

        if (toInsert.length) {
          const { error: insErr } = await admin.from('shadow_tasks').insert(toInsert as any);
          if (insErr) throw insErr;
        }

        results.push({ user_id: userId, created: toInsert.length });
      } catch (e: any) {
        results.push({ user_id: userId, error: e?.message || 'failed' });
      }
    }

    return NextResponse.json({ ok: true, total_users: userIds.length, results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
