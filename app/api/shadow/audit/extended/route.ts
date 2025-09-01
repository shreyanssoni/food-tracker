import { NextResponse } from 'next/server';
import { requireUser } from '@/utils/auth';
import { createClient } from '@/utils/supabase/server';

// Phase 3: Extended audit — detect duplicates, orphans, and multi-instance violations
export async function GET() {
  try {
    const user = await requireUser();
    const supabase = createClient();

    // Shadow profile
    const { data: profile } = await supabase
      .from('shadow_profile')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ ok: true, has_shadow_profile: false, issues: {} });
    }

    // tasks for user
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id')
      .eq('user_id', user.id);
    const taskIdSet = new Set((tasks || []).map((t: any) => t.id));

    // shadow_tasks for profile
    const { data: st } = await supabase
      .from('shadow_tasks')
      .select('id, task_id, status, assigned_at')
      .eq('shadow_id', profile.id)
      .order('assigned_at', { ascending: true });

    const shadowTasks = st || [];

    // Duplicates: same task_id repeated >1
    const byTask = new Map<string, any[]>();
    for (const row of shadowTasks) {
      const arr = byTask.get(row.task_id) || [];
      arr.push(row);
      byTask.set(row.task_id, arr);
    }
    const duplicateGroups: { task_id: string; shadow_task_ids: string[] }[] = [];
    for (const [task_id, rows] of byTask.entries()) {
      if ((rows?.length || 0) > 1) duplicateGroups.push({ task_id, shadow_task_ids: rows.map(r => r.id) });
    }

    // Orphans: shadow_tasks pointing to non-existent user task (shouldn't happen due to FK, but check)
    const orphans = shadowTasks.filter((r) => !taskIdSet.has(r.task_id)).map(r => r.id);

    // Instances per day violations (more than one instance for same (shadow_task_id, planned_date_local))
    const { data: inst } = await supabase
      .from('shadow_task_instances')
      .select('id, shadow_task_id, planned_date_local, created_at')
      .in('shadow_task_id', shadowTasks.map(r => r.id));

    const byKey = new Map<string, any[]>();
    for (const row of (inst || [])) {
      const key = `${row.shadow_task_id}|${row.planned_date_local}`;
      const arr = byKey.get(key) || [];
      arr.push(row);
      byKey.set(key, arr);
    }
    const multiPerDay: { shadow_task_id: string; planned_date_local: string; instance_ids: string[] }[] = [];
    for (const [key, rows] of byKey.entries()) {
      if (rows.length > 1) {
        const [shadow_task_id, planned_date_local] = key.split('|');
        multiPerDay.push({ shadow_task_id, planned_date_local, instance_ids: rows.map(r => r.id) });
      }
    }

    return NextResponse.json({
      ok: true,
      has_shadow_profile: true,
      counts: {
        shadow_tasks: shadowTasks.length,
        duplicate_task_groups: duplicateGroups.length,
        orphan_shadow_tasks: orphans.length,
        multi_instances_keys: multiPerDay.length,
      },
      issues: {
        duplicate_groups: duplicateGroups,
        orphan_shadow_task_ids: orphans,
        multi_instances: multiPerDay,
      },
    });
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
