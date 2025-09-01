import { NextResponse } from 'next/server';
import { requireUser } from '@/utils/auth';
import { createClient } from '@/utils/supabase/server';

// Phase 5: Complete a shadow event (instance) — mark completed and log alignment
export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const supabase = createClient();
    const id = params.id;

    // Load instance joined to shadow_task -> shadow_profile to enforce ownership
    const { data: inst, error: instErr } = await supabase
      .from('shadow_task_instances')
      .select('id, shadow_task_id, planned_start_at, planned_end_at, planned_date_local, status, progress, shadow_tasks!inner(id, shadow_id, shadow_profile!inner(user_id))')
      .eq('id', id)
      .maybeSingle();
    if (instErr) throw instErr;
    if (!inst) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (inst.shadow_tasks?.shadow_profile?.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Mark completed
    const now = new Date();
    const { error: upErr } = await supabase
      .from('shadow_task_instances')
      .update({ status: 'completed', progress: 100, completed_at: now.toISOString() })
      .eq('id', id);
    if (upErr) throw upErr;

    // Determine alignment_status (ahead/behind/tied) for shadow relative to its plan
    let alignment: 'ahead' | 'behind' | 'tied' = 'tied';
    const plannedEnd = new Date(inst.planned_end_at);
    const plannedStart = new Date(inst.planned_start_at);
    if (now.getTime() < plannedStart.getTime()) alignment = 'ahead';
    else if (now.getTime() > plannedEnd.getTime()) alignment = 'behind';
    else alignment = 'tied';

    // Log alignment (shadow_only event)
    await supabase.from('alignment_log').insert({
      user_id: user.id,
      shadow_id: inst.shadow_tasks.shadow_id,
      shadow_instance_id: id,
      alignment_status: alignment,
    });

    return NextResponse.json({ ok: true, id, status: 'completed', alignment_status: alignment });
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
