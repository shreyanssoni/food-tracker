import { NextResponse } from 'next/server';
import { requireUser } from '@/utils/auth';
import { createClient } from '@/utils/supabase/server';

// Phase 1: FK mirror integrity — audit for current user
export async function GET() {
  try {
    const user = await requireUser();
    const supabase = createClient();

    // 1) Shadow profile existence
    const { data: profile } = await supabase
      .from('shadow_profile')
      .select('id, user_id, persona_type, growth_rate, timezone, created_at')
      .eq('user_id', user.id)
      .maybeSingle();

    // 2) User active tasks
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, active')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    const activeTasks = (tasks || []).filter((t: any) => t.active ?? true);

    // 3) Shadow tasks for this user
    let shadowTasks: any[] = [];
    if (profile) {
      const { data: st } = await supabase
        .from('shadow_tasks')
        .select('id, shadow_id, task_id, status')
        .eq('shadow_id', profile.id);
      shadowTasks = st || [];
    }

    const taskIdSet = new Set(activeTasks.map((t: any) => t.id));
    const mirroredTaskIdSet = new Set(shadowTasks.map((s: any) => s.task_id));

    const missingMirrors = activeTasks
      .filter((t: any) => !mirroredTaskIdSet.has(t.id))
      .map((t: any) => ({ task_id: t.id, title: t.title }));

    // Duplicates: any task_id repeated under the same shadow_id
    const dupMap = new Map<string, number>();
    for (const s of shadowTasks) {
      const key = s.task_id;
      dupMap.set(key, (dupMap.get(key) || 0) + 1);
    }
    const duplicateMirrors = shadowTasks.filter((s) => (dupMap.get(s.task_id) || 0) > 1);

    // Orphans should be prevented by FKs, but report if any (sanity)
    const orphanMirrors = shadowTasks.filter((s) => !taskIdSet.has(s.task_id));

    return NextResponse.json({
      ok: true,
      user_id: user.id,
      has_shadow_profile: !!profile,
      counts: {
        tasks_total: tasks?.length || 0,
        tasks_active: activeTasks.length,
        shadow_tasks: shadowTasks.length,
        missing_mirrors: missingMirrors.length,
        duplicate_mirrors: duplicateMirrors.length,
        orphan_mirrors: orphanMirrors.length,
      },
      details: {
        missing_mirrors: missingMirrors.slice(0, 100),
        duplicate_mirrors: duplicateMirrors.slice(0, 100),
        orphan_mirrors: orphanMirrors.slice(0, 100),
      },
    });
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
