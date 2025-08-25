import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

// GET /api/admin/rewards
// Returns rewards joined with collectible metadata via v_rewards_config
export async function GET(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient();
    const { data: me } = await supabase
      .from('app_users')
      .select('is_sys_admin')
      .eq('id', user.id)
      .maybeSingle();
    if (process.env.NODE_ENV !== 'development' && !me?.is_sys_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Rewards joined with collectible info
    const { data: rewards, error } = await supabase
      .from('v_rewards_config')
      .select('*')
      .order('unlock_level', { ascending: true });

    if (error) throw error;

    // Build grouped payload for clients that want merged cards by group_id
    const groupsMap = new Map<string, any>();
    for (const r of rewards || []) {
      const key = r.group_id
        ? `gid:${r.group_id}`
        : (r.unlock_rule === 'level'
            ? `level:${r.unlock_level ?? ''}`
            : `total_ep:${r.unlock_ep ?? ''}`);
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          group_id: r.group_id || null,
          unlock_rule: r.unlock_rule,
          unlock_level: r.unlock_rule === 'level' ? r.unlock_level : null,
          unlock_ep: r.unlock_rule === 'total_ep' ? r.unlock_ep : null,
          items: [] as any[],
        });
      }
      const g = groupsMap.get(key);
      g.items.push({
        reward_id: r.reward_id,
        kind: r.kind,
        amount: r.amount,
        collectible_id: r.collectible_id,
        collectible_name: r.collectible_name,
        collectible_icon: r.collectible_icon,
        collectible_rarity: r.collectible_rarity,
      });
    }
    const groups = Array.from(groupsMap.values()).sort((a, b) => {
      // Sort by level/ep ascending
      if (a.unlock_rule === 'level' && b.unlock_rule === 'level') return (a.unlock_level ?? 0) - (b.unlock_level ?? 0);
      if (a.unlock_rule === 'total_ep' && b.unlock_rule === 'total_ep') return (a.unlock_ep ?? 0) - (b.unlock_ep ?? 0);
      return a.unlock_rule.localeCompare(b.unlock_rule);
    });

    return NextResponse.json({ ok: true, rewards: rewards ?? [], groups });
  } catch (e) {
    console.error('admin rewards GET error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST /api/admin/rewards
// Body example:
// {
//   unlock_rule: 'level',
//   unlock_level: 5,
//   items: [
//     { kind: 'diamond', amount: 50 },
//     { kind: 'collectible', collectible_id: '<uuid>' }, // badge is a collectible with is_badge=true
//   ]
// }
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient();
    const { data: me } = await supabase
      .from('app_users')
      .select('is_sys_admin')
      .eq('id', user.id)
      .maybeSingle();
    if (process.env.NODE_ENV !== 'development' && !me?.is_sys_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const unlock_rule = body?.unlock_rule as 'level' | 'total_ep';
    if (!unlock_rule || !['level','total_ep'].includes(unlock_rule)) {
      return NextResponse.json({ error: 'unlock_rule must be level or total_ep' }, { status: 400 });
    }

    const unlock_level = unlock_rule === 'level' ? Number(body?.unlock_level) : null;
    const unlock_ep = unlock_rule === 'total_ep' ? Number(body?.unlock_ep) : null;
    if (unlock_rule === 'level' && !(unlock_level && unlock_level > 0)) {
      return NextResponse.json({ error: 'unlock_level required and > 0' }, { status: 400 });
    }
    if (unlock_rule === 'total_ep' && !(unlock_ep && unlock_ep > 0)) {
      return NextResponse.json({ error: 'unlock_ep required and > 0' }, { status: 400 });
    }

    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return NextResponse.json({ error: 'items required' }, { status: 400 });

    // Find or create a reward group for this unlock condition
    const { data: grp, error: gErr } = await supabase
      .from('level_reward_groups')
      .upsert(
        [
          {
            unlock_rule,
            unlock_level: unlock_rule === 'level' ? unlock_level : null,
            unlock_ep: unlock_rule === 'total_ep' ? unlock_ep : null,
          },
        ],
        { onConflict: 'group_key' }
      )
      .select('id')
      .single();
    if (gErr) throw gErr;
    const group_id = grp?.id as string;

    // Prepare inserts for standard rewards
    const rewardRows: any[] = [];
    // Track class-level operations (rarity)
    const classRarities: string[] = [];

    for (const it of items) {
      const kind = it?.kind as 'diamond' | 'collectible' | 'collectible_class';
      if (!['diamond','collectible','collectible_class'].includes(kind)) {
        return NextResponse.json({ error: 'Invalid item.kind' }, { status: 400 });
      }
      if (kind === 'collectible_class') {
        if (unlock_rule !== 'level') {
          return NextResponse.json({ error: 'collectible_class is only supported for unlock_rule=level' }, { status: 400 });
        }
        const rarity = (it?.collectible_class || '').toString();
        if (!rarity) {
          return NextResponse.json({ error: 'collectible_class (rarity) required' }, { status: 400 });
        }
        classRarities.push(rarity);
        continue;
      }
      rewardRows.push({
        kind,
        amount: kind === 'diamond' ? Number(it?.amount ?? 0) : null,
        collectible_id: kind === 'collectible' ? (it?.collectible_id ?? null) : null,
        unlock_rule,
        unlock_level,
        unlock_ep,
        group_id,
      });
    }

    let insertedRewardIds: string[] = [];
    if (rewardRows.length) {
      const { data, error } = await supabase.from('rewards').insert(rewardRows).select('id');
      if (error) throw error;
      insertedRewardIds = (data ?? []).map((r: any) => r.id);
    }

    // Process collectible_class rarities: set access requirement min_level for all collectibles of that rarity
    if (classRarities.length && unlock_rule === 'level' && unlock_level) {
      // Fetch collectible ids by rarity; exclude private/user-owned items
      const { data: colls, error: cErr } = await supabase
        .from('collectibles')
        .select('id')
        .in('rarity', classRarities as any)
        .eq('is_private', false);
      if (cErr) throw cErr;
      const ids = (colls || []).map((c: any) => c.id);
      if (ids.length) {
        const reqRows = ids.map((cid: string) => ({
          collectible_id: cid,
          min_level: unlock_level,
          required_badge_id: null,
          required_goal_id: null,
          require_goal_success: false,
        }));
        const { error: qErr } = await supabase
          .from('collectibles_requirements')
          .upsert(reqRows, { onConflict: 'collectible_id' });
        if (qErr) throw qErr;
      }
    }
    return NextResponse.json({ ok: true, group_id, ids: insertedRewardIds });
  } catch (e) {
    console.error('admin rewards POST error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
