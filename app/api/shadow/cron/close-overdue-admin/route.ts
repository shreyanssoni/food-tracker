import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET || '';
  const q = req.nextUrl.searchParams.get('secret') || '';
  if (!secret || q !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: pending, error } = await admin
    .from('shadow_challenges')
    .select('id, user_id, shadow_profile_id, ep_awarded')
    .eq('status', 'pending')
    .lt('deadline', nowIso)
    .limit(10000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let closed = 0;
  for (const ch of pending || []) {
    const award = typeof ch.ep_awarded === 'number' && ch.ep_awarded !== null ? ch.ep_awarded : 10;
    const { error: updErr } = await admin
      .from('shadow_challenges')
      .update({ status: 'lost', winner: 'shadow', ep_awarded: award, resolved_at: new Date().toISOString() })
      .eq('id', ch.id)
      .eq('status', 'pending');
    if (updErr) continue;

    // increment shadow EP
    const { error: rpcErr } = await admin.rpc('increment_shadow_ep', { p_shadow_profile_id: ch.shadow_profile_id, p_delta: award });
    if (rpcErr) {
      const { data: sp } = await admin.from('shadow_profile').select('shadow_ep').eq('id', ch.shadow_profile_id).single();
      const cur = (sp?.shadow_ep ?? 0) as number;
      await admin.from('shadow_profile').update({ shadow_ep: cur + award }).eq('id', ch.shadow_profile_id);
    }

    // Unified ledger credit to shadow (best effort)
    try {
      await admin
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
      await admin.from('achievement_events').insert({
        user_id: ch.user_id as any,
        event_type: 'shadow_challenge_loss',
        ref_id: ch.id as any,
        meta: { ep: award },
      } as any);
    } catch {}

    closed += 1;
  }

  return NextResponse.json({ ok: true, closed });
}
