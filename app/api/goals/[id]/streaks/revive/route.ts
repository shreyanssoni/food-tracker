import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createClient();

    // Load goal and ownership
    const { data: goal, error: gErr } = await supabase
      .from('goals')
      .select('id, user_id, start_date')
      .eq('id', params.id)
      .single();
    if (gErr) throw gErr;
    if (!goal || goal.user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Determine yesterday (UTC date string)
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yKey = yesterday.toISOString().slice(0, 10);

    // Must be within 24h window and not before goal start
    const goalStart = new Date(String((goal as any).start_date));
    goalStart.setHours(0,0,0,0);
    const within24h = (today.getTime() - yesterday.getTime()) <= 24*60*60*1000 && today > yesterday;
    if (!within24h || yesterday < goalStart) {
      return NextResponse.json({ error: 'Revive window closed' }, { status: 400 });
    }

    // Fetch task links
    const { data: links, error: lErr } = await supabase
      .from('goal_tasks')
      .select('task_id')
      .eq('goal_id', params.id);
    if (lErr) throw lErr;
    const taskIds = Array.from(new Set((links || []).map((l: any) => l.task_id))).filter(Boolean);

    // Check if yesterday already completed for any task or already revived
    let completed = false;
    if (taskIds.length) {
      const { data: comps, error: cErr } = await supabase
        .from('task_completions')
        .select('id')
        .eq('user_id', user.id)
        .in('task_id', taskIds as any)
        .eq('completed_on', yKey)
        .limit(1);
      if (cErr) throw cErr;
      completed = (comps || []).length > 0;
    }
    const { data: revived } = await supabase
      .from('goal_streak_revives')
      .select('revive_date')
      .eq('goal_id', params.id)
      .eq('user_id', user.id)
      .eq('revive_date', yKey)
      .maybeSingle();
    if (completed || revived) {
      return NextResponse.json({ error: 'Already completed or revived' }, { status: 409 });
    }

    // Check diamonds balance
    const { data: prog, error: pErr } = await supabase
      .from('user_progress')
      .select('diamonds')
      .eq('user_id', user.id)
      .maybeSingle();
    if (pErr) throw pErr;
    const diamonds = prog?.diamonds ?? 0;
    const cost = 20;
    if (diamonds < cost) return NextResponse.json({ error: 'Insufficient diamonds' }, { status: 400 });

    // Perform atomic updates
    const { error: insErr } = await supabase
      .from('goal_streak_revives')
      .insert({ goal_id: params.id, user_id: user.id, revive_date: yKey });
    if (insErr) throw insErr;

    const newDiamonds = diamonds - cost;
    const [{ error: upErr }, { error: ledErr }] = await Promise.all([
      supabase.from('user_progress').update({ diamonds: newDiamonds }).eq('user_id', user.id),
      supabase.from('diamond_ledger').insert({ user_id: user.id, delta: -cost, reason: 'revive' }),
    ]);
    if (upErr) throw upErr;
    if (ledErr) throw ledErr;

    return NextResponse.json({ success: true, diamonds: newDiamonds, revived_date: yKey });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
