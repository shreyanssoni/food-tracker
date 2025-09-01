import { NextResponse } from 'next/server';
import { requireUser } from '@/utils/auth';
import { createClient } from '@/utils/supabase/server';

// Phase 3: Extended fixer — dedupe shadow_tasks, remove orphans, collapse multi-instance-per-day
export async function POST() {
  try {
    const user = await requireUser();
    const supabase = createClient();

    // Shadow profile
    const { data: profile } = await supabase
      .from('shadow_profile')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!profile) return NextResponse.json({ error: 'Missing shadow_profile' }, { status: 400 });

    // Load tasks and shadow_tasks
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, created_at')
      .eq('user_id', user.id);
    const taskIdSet = new Set((tasks || []).map((t: any) => t.id));

    const { data: st } = await supabase
      .from('shadow_tasks')
      .select('id, task_id, status, assigned_at')
      .eq('shadow_id', profile.id)
      .order('assigned_at', { ascending: true });

    const shadowTasks = st || [];

    // Dedupe by task_id (keep earliest assigned)
    const toKeep = new Set<string>();
    const toDeleteShadowTaskIds: string[] = [];
    const byTask = new Map<string, any[]>();
    for (const row of shadowTasks) {
      const arr = byTask.get(row.task_id) || [];
      arr.push(row);
      byTask.set(row.task_id, arr);
    }
    for (const [task_id, rows] of byTask.entries()) {
      const sorted = rows.sort((a, b) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime());
      const keep = sorted[0];
      toKeep.add(keep.id);
      for (let i = 1; i < sorted.length; i++) toDeleteShadowTaskIds.push(sorted[i].id);
    }

    // Orphans: shadow_tasks where linked task is missing
    for (const row of shadowTasks) {
      if (!taskIdSet.has(row.task_id)) {
        toDeleteShadowTaskIds.push(row.id);
      }
    }

    // Delete shadow_task rows marked for deletion
    let deletedShadowTasks = 0;
    if (toDeleteShadowTaskIds.length) {
      const { error: delErr } = await supabase
        .from('shadow_tasks')
        .delete()
        .in('id', toDeleteShadowTaskIds);
      if (delErr) throw delErr;
      deletedShadowTasks = toDeleteShadowTaskIds.length;
    }

    // Multi instance per day fixes: keep earliest created_at per (shadow_task_id, planned_date_local), delete others
    const { data: inst } = await supabase
      .from('shadow_task_instances')
      .select('id, shadow_task_id, planned_date_local, created_at')
      .in('shadow_task_id', Array.from(new Set([...
        Array.from(toKeep),
        ...shadowTasks.map(r => r.id)
      ])));

    const byKey = new Map<string, any[]>();
    for (const row of (inst || [])) {
      const key = `${row.shadow_task_id}|${row.planned_date_local}`;
      const arr = byKey.get(key) || [];
      arr.push(row);
      byKey.set(key, arr);
    }

    const toDeleteInstanceIds: string[] = [];
    for (const [_, rows] of byKey.entries()) {
      if (rows.length > 1) {
        rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        for (let i = 1; i < rows.length; i++) toDeleteInstanceIds.push(rows[i].id);
      }
    }

    let deletedInstances = 0;
    if (toDeleteInstanceIds.length) {
      const { error: delInstErr } = await supabase
        .from('shadow_task_instances')
        .delete()
        .in('id', toDeleteInstanceIds);
      if (delInstErr) throw delInstErr;
      deletedInstances = toDeleteInstanceIds.length;
    }

    return NextResponse.json({ ok: true, deleted_shadow_tasks: deletedShadowTasks, deleted_instances: deletedInstances });
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
