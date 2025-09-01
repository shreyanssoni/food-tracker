import { NextResponse } from 'next/server';
import { requireUser } from '@/utils/auth';
import { createClient } from '@/utils/supabase/server';

// Phase 1: FK mirror integrity — basic fixer for current user
export async function POST() {
  try {
    const user = await requireUser();
    const supabase = createClient();

    // Resolve timezone from preferences (optional)
    let tz: string | null = null;
    try {
      const { data: pref } = await supabase
        .from('user_preferences')
        .select('timezone')
        .eq('user_id', user.id)
        .maybeSingle();
      if (pref?.timezone) tz = String(pref.timezone);
    } catch {}

    // Ensure shadow_profile exists
    const { data: existing } = await supabase
      .from('shadow_profile')
      .select('id, user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let profileId = existing?.id as string | undefined;
    if (!profileId) {
      const { data: ins, error: insErr } = await supabase
        .from('shadow_profile')
        .insert({ user_id: user.id, persona_type: 'neutral', growth_rate: 1, timezone: tz })
        .select('id')
        .single();
      if (insErr) throw insErr;
      profileId = ins?.id as string;
    }

    // Get active tasks
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, active')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    const activeTasks = (tasks || []).filter((t: any) => t.active ?? true);

    // Existing shadow_tasks
    const { data: st } = await supabase
      .from('shadow_tasks')
      .select('id, task_id')
      .eq('shadow_id', profileId);

    const mirrored = new Set((st || []).map((r: any) => r.task_id));
    const missing = activeTasks.filter((t: any) => !mirrored.has(t.id));

    // Insert missing mirrors
    let created = 0;
    if (missing.length) {
      const rows = missing.map((t: any) => ({ shadow_id: profileId, task_id: t.id, status: 'active' }));
      const { error: mErr } = await supabase.from('shadow_tasks').insert(rows);
      if (mErr) throw mErr;
      created = rows.length;
    }

    return NextResponse.json({ ok: true, profile_id: profileId, created_shadow_tasks: created, checked_active_tasks: activeTasks.length });
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
