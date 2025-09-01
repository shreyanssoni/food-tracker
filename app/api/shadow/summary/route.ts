import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getCurrentUser } from '@/utils/auth';

// GET /api/shadow/summary
// Returns aggregated EP for current user vs their shadow profile from entity_ep_ledger
export async function GET(_req: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();

    // Resolve shadow profile for this user
    const { data: sp, error: spErr } = await admin
      .from('shadow_profile')
      .select('id')
      .eq('user_id', me.id)
      .maybeSingle();
    if (spErr) throw spErr;

    // Aggregate user EP
    const { data: userAgg, error: uErr } = await admin
      .from('entity_ep_ledger')
      .select('amount')
      .eq('entity_type', 'user')
      .eq('entity_id', me.id);
    if (uErr) throw uErr;
    const userEP = (userAgg || []).reduce((sum, r: any) => sum + (r.amount || 0), 0);

    // Aggregate shadow EP (if profile exists)
    let shadowEP = 0;
    if (sp?.id) {
      const { data: shAgg, error: sErr } = await admin
        .from('entity_ep_ledger')
        .select('amount')
        .eq('entity_type', 'shadow')
        .eq('entity_id', sp.id);
      if (sErr) throw sErr;
      shadowEP = (shAgg || []).reduce((sum, r: any) => sum + (r.amount || 0), 0);
    }

    return NextResponse.json({ userEP, shadowEP, shadowProfileId: sp?.id || null });
  } catch (e) {
    console.error('shadow summary error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
