import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

// POST /api/shadow/challenges/[id]/complete
// Marks a pending shadow challenge as won if completed before deadline and awards EP to the user.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient();

    // Load shadow challenge
    const { data: ch, error: cErr } = await supabase
      .from('shadow_challenges')
      .select('id, user_id, shadow_profile_id, status, deadline, ep_awarded')
      .eq('id', params.id)
      .single();
    if (cErr) throw cErr;
    if (!ch || ch.user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (ch.status !== 'pending') {
      return NextResponse.json({ error: 'Challenge not pending' }, { status: 400 });
    }

    const now = new Date();
    const due = new Date(ch.deadline);
    const userWins = now <= due;

    if (!userWins) {
      return NextResponse.json({ error: 'Deadline passed' }, { status: 400 });
    }

    const award = typeof ch.ep_awarded === 'number' && ch.ep_awarded !== null ? ch.ep_awarded : 10;

    // Mark as won
    const { error: updErr } = await supabase
      .from('shadow_challenges')
      .update({ status: 'won', winner: 'user', ep_awarded: award, resolved_at: new Date().toISOString() })
      .eq('id', ch.id)
      .eq('status', 'pending');
    if (updErr) throw updErr;

    // Increment user EP
    try {
      const rpcRes = await supabase.rpc('increment_user_ep', { p_user_id: user.id, p_delta: award });
      if (rpcRes.error) {
        const { data: uRow } = await supabase.from('app_users').select('user_ep').eq('id', user.id).single();
        const current = (uRow?.user_ep ?? 0) as number;
        await supabase.from('app_users').update({ user_ep: current + award }).eq('id', user.id);
      }
    } catch {}

    // Unified ledger (best effort)
    try {
      await supabase
        .from('entity_ep_ledger')
        .insert({
          entity_type: 'user',
          entity_id: user.id as any,
          source: 'challenge',
          amount: award,
          meta: { shadow_challenge_id: ch.id },
        } as any);
    } catch {}

    // Achievement logging (best effort)
    try {
      // Log event
      await supabase.from('achievement_events').insert({
        user_id: user.id as any,
        event_type: 'shadow_challenge_win',
        ref_id: ch.id as any,
        meta: { ep: award },
      } as any);

      // Award first win badge if exists and not yet awarded
      const { data: ach } = await supabase
        .from('achievements')
        .select('id')
        .eq('code', 'first_shadow_win')
        .single();
      if (ach?.id) {
        const { data: has } = await supabase
          .from('user_achievements')
          .select('id')
          .eq('user_id', user.id)
          .eq('achievement_id', ach.id)
          .maybeSingle();
        if (!has) {
          await supabase.from('user_achievements').insert({
            user_id: user.id as any,
            achievement_id: ach.id,
            meta: { reason: 'first shadow challenge win' },
          } as any);
        }
      }

      // Milestone: 5 total wins
      const winCountRes = await supabase
        .from('shadow_challenges')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'won');
      const winsTotal = (winCountRes as any)?.count ?? 0;
      if (winsTotal >= 5) {
        const { data: ach2 } = await supabase
          .from('achievements')
          .select('id')
          .eq('code', 'five_shadow_wins')
          .single();
        if (ach2?.id) {
          const { data: has2 } = await supabase
            .from('user_achievements')
            .select('id')
            .eq('user_id', user.id)
            .eq('achievement_id', ach2.id)
            .maybeSingle();
          if (!has2) {
            await supabase.from('user_achievements').insert({
              user_id: user.id as any,
              achievement_id: ach2.id,
              meta: { reason: 'won 5 shadow challenges' },
            } as any);
          }
        }
      }
    } catch {}

    return NextResponse.json({ ok: true, award });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
