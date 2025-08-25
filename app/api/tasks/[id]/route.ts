import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createClient();
    const body = await req.json();
    const { title, description, ep_value, active } = body || {};

    const updates: any = { updated_at: new Date().toISOString() };
    if (typeof title === 'string') updates.title = title;
    if (typeof description === 'string') updates.description = description;
    if (typeof ep_value === 'number') updates.ep_value = ep_value;
    if (typeof active === 'boolean') updates.active = active;

    // Only allow updating user's own tasks
    const { data: task, error: tErr } = await supabase
      .from('tasks')
      .select('id, user_id')
      .eq('id', params.id)
      .single();
    if (tErr) throw tErr;
    if (!task || task.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', params.id)
      .select('*')
      .single();
    if (error) throw error;

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createClient();

    // Only allow deleting user's own tasks
    const { data: task, error: tErr } = await supabase
      .from('tasks')
      .select('id, user_id')
      .eq('id', params.id)
      .single();
    if (tErr) throw tErr;
    if (!task || task.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Sum EP awarded by this task's completions for this user
    const { data: completions, error: cErr } = await supabase
      .from('task_completions')
      .select('id, ep_awarded')
      .eq('user_id', user.id)
      .eq('task_id', params.id);
    if (cErr) throw cErr;

    const epToRevert = (completions || []).reduce((sum: number, r: any) => sum + (r.ep_awarded || 0), 0);

    if (epToRevert > 0) {
      // Load current progress
      const { data: prog, error: pErr } = await supabase
        .from('user_progress')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (pErr) throw pErr;

      const currentTotal = prog?.total_ep ?? 0;
      let newTotal = currentTotal - epToRevert;
      if (newTotal < 0) newTotal = 0;

      // Recompute level and ep_in_level from newTotal using levels table
      // Fetch levels ordered ascending
      const { data: levels, error: lErr } = await supabase
        .from('levels')
        .select('level, ep_required')
        .order('level');
      if (lErr) throw lErr;

      let level = 1;
      let remaining = newTotal;
      if (levels && levels.length) {
        for (const row of levels) {
          const need = row.ep_required ?? (100 + (row.level - 1) * 20);
          if (remaining >= need) {
            remaining -= need;
            level = Math.max(level, row.level + 1);
          } else {
            level = Math.max(level, row.level);
            break;
          }
        }
      } else {
        // fallback curve if levels table empty
        let curLevel = 1;
        while (true) {
          const need = 100 + (curLevel - 1) * 20;
          if (remaining >= need) {
            remaining -= need;
            curLevel += 1;
          } else {
            level = curLevel;
            break;
          }
        }
      }
      const ep_in_level = remaining;

      // Compensating ledger entry
      const { error: ledErr } = await supabase
        .from('ep_ledger')
        .insert({ user_id: user.id, source: 'task_delete', source_id: params.id, delta_ep: -epToRevert });
      if (ledErr) throw ledErr;

      // Update progress
      const { error: upErr } = await supabase
        .from('user_progress')
        .update({ total_ep: newTotal, level, ep_in_level, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (upErr) throw upErr;

      // Remove the task completions rows
      const { error: delCompErr } = await supabase
        .from('task_completions')
        .delete()
        .eq('user_id', user.id)
        .eq('task_id', params.id);
      if (delCompErr) throw delCompErr;
    }

    const { error } = await supabase.from('tasks').delete().eq('id', params.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
