import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createClient();

    // Get user progress (level, total_ep) and owned collectibles and claimed rewards
    const [{ data: prog }, { data: owned }, { data: claims }] = await Promise.all([
      supabase.from('user_progress').select('level,total_ep,diamonds').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_collectibles').select('collectible_id').eq('user_id', user.id),
      supabase.from('user_reward_claims').select('reward_id').eq('user_id', user.id),
    ]);
    const level = prog?.level ?? 1;
    const total_ep = prog?.total_ep ?? 0;
    const ownedSet = new Set((owned || []).map((r: any) => r.collectible_id));
    const claimedSet = new Set((claims || []).map((r: any) => r.reward_id));

    // Rewards with collectible metadata
    const { data: rewards, error } = await supabase
      .from('rewards')
      .select('id, kind, amount, collectible_id, unlock_level, unlock_rule, unlock_ep')
      .order('unlock_level');
    if (error) throw error;

    let collectiblesMeta: Record<string, any> = {};
    const colIds = Array.from(new Set((rewards || []).map((r) => r.collectible_id).filter(Boolean)));
    if (colIds.length) {
      const { data: cols, error: cErr } = await supabase
        .from('collectibles')
        .select('*')
        .in('id', colIds as string[]);
      if (cErr) throw cErr;
      for (const c of cols || []) collectiblesMeta[c.id] = c;
    }

    const result = (rewards || []).map((r: any) => {
      const rule = r.unlock_rule || 'level';
      const unlocked = rule === 'total_ep'
        ? (typeof r.unlock_ep === 'number' ? total_ep >= r.unlock_ep : false)
        : (level >= r.unlock_level);
      return {
        ...r,
        unlocked,
        claimed: claimedSet.has(r.id),
        collectible: r.collectible_id ? collectiblesMeta[r.collectible_id] : null,
        owned: r.collectible_id ? ownedSet.has(r.collectible_id) : undefined,
      };
    });

    return NextResponse.json({ rewards: result, level, total_ep, owned: Array.from(ownedSet) });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
