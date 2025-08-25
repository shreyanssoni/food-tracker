import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

// Simplified undo: removes completion and EP ledger entry; adjusts user_progress EP downward within current level only.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createClient();

    // Load completion
    const { data: completion, error: cErr } = await supabase
      .from('task_completions')
      .select('*')
      .eq('id', params.id)
      .single();
    if (cErr) throw cErr;
    if (!completion || completion.user_id !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const ep = completion.ep_awarded as number;

    // Delete completion
    const { error: delErr } = await supabase.from('task_completions').delete().eq('id', params.id);
    if (delErr) throw delErr;

    // Delete EP ledger entries that reference this completion
    await supabase.from('ep_ledger').delete().eq('source', 'task').eq('source_id', params.id);

    // Adjust progress: reduce ep_in_level and total_ep, do not downgrade levels (forgiving system)
    const { data: progress, error: pErr } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (pErr) throw pErr;

    if (progress) {
      const newTotal = Math.max(0, (progress.total_ep as number) - ep);
      const newEpInLevel = Math.max(0, (progress.ep_in_level as number) - ep);
      const { error: updErr } = await supabase
        .from('user_progress')
        .update({ total_ep: newTotal, ep_in_level: newEpInLevel, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (updErr) throw updErr;
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
