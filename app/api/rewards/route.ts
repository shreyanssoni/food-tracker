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
      .select('id, kind, amount, collectible_id, unlock_level, unlock_rule, unlock_ep, group_id')
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

    // Build grouped payload for merged cards by group_id (fallback to normalized unlock condition)
    const groupsMap = new Map<string, any>();
    for (const r of result) {
      const key = r.group_id
        ? `gid:${r.group_id}`
        : (r.unlock_rule === 'total_ep'
            ? `total_ep:${r.unlock_ep ?? ''}`
            : `level:${r.unlock_level ?? ''}`);
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          group_id: r.group_id || null,
          unlock_rule: r.unlock_rule || 'level',
          unlock_level: (r.unlock_rule || 'level') === 'level' ? r.unlock_level : null,
          unlock_ep: (r.unlock_rule || 'level') === 'total_ep' ? r.unlock_ep : null,
          unlocked: r.unlocked,
          // Consider a group claimed if all items are claimed (can adjust in UI if needed)
          all_claimed: true,
          items: [] as any[],
        });
      }
      const g = groupsMap.get(key);
      g.unlocked = g.unlocked || r.unlocked;
      g.all_claimed = g.all_claimed && !!r.claimed;
      g.items.push({
        reward_id: r.id,
        kind: r.kind,
        amount: r.amount,
        collectible_id: r.collectible_id,
        collectible: r.collectible,
        owned: r.owned,
        claimed: r.claimed,
      });
    }
    const groups = Array.from(groupsMap.values()).sort((a, b) => {
      if (a.unlock_rule === 'level' && b.unlock_rule === 'level') return (a.unlock_level ?? 0) - (b.unlock_level ?? 0);
      if (a.unlock_rule === 'total_ep' && b.unlock_rule === 'total_ep') return (a.unlock_ep ?? 0) - (b.unlock_ep ?? 0);
      return a.unlock_rule.localeCompare(b.unlock_rule);
    });

    return NextResponse.json({ rewards: result, groups, level, total_ep, owned: Array.from(ownedSet) });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
