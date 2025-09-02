/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

// GET /api/shadow/ledger?limit=50
// Returns unified EP ledger entries from entity_ep_ledger for the current user and their shadow
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient();
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);

    // RLS on entity_ep_ledger ensures we only see rows for the requesting user's user/shadow
    const { data, error } = await supabase
      .from('entity_ep_ledger')
      .select('id, entity_type, entity_id, source, amount, meta, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    // Also fetch quick totals for scoreboard (best-effort)
    const [userTotalRes, shadowProfileRes] = await Promise.all([
      supabase.from('app_users').select('user_ep').eq('id', user.id).single(),
      supabase.from('shadow_profile').select('id, shadow_ep').eq('user_id', user.id).single(),
    ]);

    const user_ep = (userTotalRes.data?.user_ep ?? 0) as number;
    const shadow_ep = (shadowProfileRes.data?.shadow_ep ?? 0) as number;
    const shadow_profile_id = shadowProfileRes.data?.id ?? null;

    return NextResponse.json({ entries: data ?? [], user_ep, shadow_ep, shadow_profile_id });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
