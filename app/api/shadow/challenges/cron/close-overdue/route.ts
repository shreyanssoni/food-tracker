import { NextResponse } from 'next/server';
import { requireUser } from '@/utils/auth';
import { createClient } from '@/utils/supabase/server';

export async function POST() {
  try {
    const user = await requireUser();
    const supabase = createClient();

    // Fetch pending challenges past deadline
    const nowIso = new Date().toISOString();
    const { data: challenges, error: listErr } = await supabase
      .from('shadow_challenges')
      .select('id, user_id, shadow_profile_id, ep_awarded')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .lt('deadline', nowIso);

    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
    if (!challenges?.length) return NextResponse.json({ ok: true, closed: 0 });

    let closed = 0;
    for (const ch of challenges) {
      // Determine EP to award; fallback 10
      const award = typeof ch.ep_awarded === 'number' && ch.ep_awarded !== null ? ch.ep_awarded : 10;

      const { error: updErr } = await supabase
        .from('shadow_challenges')
        .update({ status: 'lost', winner: 'shadow', ep_awarded: award, resolved_at: new Date().toISOString() })
        .eq('id', ch.id)
        .eq('status', 'pending');
      if (updErr) continue;

      // Increment shadow EP on profile
      try {
        const rpcRes = await supabase.rpc('increment_shadow_ep', { p_shadow_profile_id: ch.shadow_profile_id, p_delta: award });
        if (rpcRes.error) {
          // Fallback if RPC doesn't exist: fetch current and update
          const { data: spRow, error: spErr } = await supabase
            .from('shadow_profile')
            .select('shadow_ep')
            .eq('id', ch.shadow_profile_id)
            .single();
          if (!spErr) {
            const current = (spRow?.shadow_ep ?? 0) as number;
            await supabase
              .from('shadow_profile')
              .update({ shadow_ep: current + award })
              .eq('id', ch.shadow_profile_id);
          }
        }
      } catch {
        // ignore EP increment failure
      }

      // Unified ledger credit to shadow (best effort)
      try {
        await supabase
          .from('entity_ep_ledger')
          .insert({
            entity_type: 'shadow',
            entity_id: ch.shadow_profile_id as any,
            source: 'challenge',
            amount: award,
            meta: { shadow_challenge_id: ch.id },
          } as any);
      } catch {}

      // Achievement event: user loss (best effort)
      try {
        await supabase.from('achievement_events').insert({
          user_id: (ch as any).user_id || (user.id as any),
          event_type: 'shadow_challenge_loss',
          ref_id: ch.id as any,
          meta: { ep: award },
        } as any);
      } catch {}

      closed += 1;
    }

    return NextResponse.json({ ok: true, closed });
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
