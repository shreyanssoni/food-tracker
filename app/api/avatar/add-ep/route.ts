import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { requireUser } from '@/utils/auth';

function requiredEpFor(level: number) {
  return Math.round(100 * Math.pow(1.5, Math.max(0, level - 1)));
}
function stageFor(level: number) {
  if (level >= 30) return 'stage6';
  if (level >= 20) return 'stage5';
  if (level >= 15) return 'stage4';
  if (level >= 10) return 'stage3';
  if (level >= 5) return 'stage2';
  return 'stage1';
}

const rarityWeights = { common: 70, rare: 22, epic: 7, legendary: 1 } as const;
function pickByWeight<T extends { rarity?: keyof typeof rarityWeights }>(items: T[]): T | null {
  if (!items.length) return null;
  const total = items.reduce((s, i) => s + rarityWeights[(i.rarity || 'common')], 0);
  let r = Math.random() * total;
  for (const i of items) { r -= rarityWeights[(i.rarity || 'common')]; if (r <= 0) return i; }
  return items[items.length - 1];
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const supabase = createAdminClient();
    const body = await req.json().catch(() => ({}));
    const ep = Number(body?.ep ?? 0);
    if (!Number.isFinite(ep) || ep <= 0 || ep > 10000) {
      return NextResponse.json({ error: 'Invalid ep' }, { status: 400 });
    }
    // Ensure user_progress exists
    const { data: progress, error: pErr } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (pErr) throw pErr;
    let level = progress?.level ?? 1;
    let ep_in_level = (progress?.ep_in_level ?? 0) + ep;
    let total_ep = (progress?.total_ep ?? 0);
    let diamonds = progress?.diamonds ?? 0;
    if (!progress) {
      const { error: insErr } = await supabase
        .from('user_progress')
        .insert({ user_id: user.id, level: 1, ep_in_level: 0, total_ep: 0, diamonds: 0 });
      if (insErr) throw insErr;
      // after insert, our local vars reflect the initial state with ep applied above
    }

    const awarded: any[] = [];
    let leveledUp = false;

    // Level-up loop using dynamic requirements from levels table (fallback to curve)
    async function getEpRequired(lvl: number): Promise<number> {
      const { data, error } = await supabase.from('levels').select('ep_required').eq('level', lvl).maybeSingle();
      if (error) throw error;
      return data?.ep_required ?? requiredEpFor(lvl);
    }

    while (true) {
      const need = await getEpRequired(level);
      if (ep_in_level < need) break;
      // consume and level up
      ep_in_level -= need;
      const fromLevel = level;
      level += 1;
      leveledUp = true;

      // Drop collectible: filter catalog by unlock_level<=level and not owned
      const { data: owned } = await supabase
        .from('user_collectibles')
        .select('collectible_id')
        .eq('user_id', user.id);
      const ownedSet = new Set((owned || []).map(o => o.collectible_id));

      // Fetch candidate collectibles from existing catalog (system-owned, not private)
      const { data: catalog } = await supabase
        .from('collectibles')
        .select('id, name, rarity, icon, is_badge, is_private, owner_user_id');

      // Requirements: min_level
      const { data: reqs } = await supabase
        .from('collectibles_requirements')
        .select('collectible_id, min_level');
      const minLevelById = new Map<string, number>();
      for (const r of reqs || []) minLevelById.set(r.collectible_id, r.min_level ?? 1);

      type Candidate = { id: string; name: string; rarity?: 'common'|'rare'|'epic'|'legendary'; type?: string; icon?: string };
      const candidates: Candidate[] = (catalog || []).filter((c: any) => {
        if (ownedSet.has(c.id)) return false;
        if (c.is_private) return false;
        if (c.owner_user_id) return false;
        if (c.is_badge) return false; // keep badges for achievements, not drops
        const reqLevel = minLevelById.get(c.id) ?? 1;
        return reqLevel <= level;
      }) as Candidate[];

      const chosen = pickByWeight<Candidate>(candidates);

      let awarded_collectible_id: string | null = null;
      if (chosen) {
        await supabase
          .from('user_collectibles')
          .insert({ user_id: user.id, collectible_id: chosen.id })
          .then(() => {});
        awarded_collectible_id = chosen.id;
        awarded.push({ collectible: chosen });
      }

      await supabase.from('avatar_level_ups').insert({
        user_id: user.id,
        from_level: fromLevel,
        to_level: level,
        awarded_collectible_id
      });

      await supabase.from('notifications').insert({
        user_id: user.id,
        message: awarded.length
          ? `🎉 Level up! You reached Lv.${level} and unlocked ${awarded[awarded.length-1].collectible.name}`
          : `🎉 Level up! You reached Lv.${level}`,
        triggered_by: 'level_up'
      });
    }

    // Update user_progress as the single source of truth
    total_ep += ep;
    const { error: upProgErr } = await supabase
      .from('user_progress')
      .update({ level, ep_in_level, total_ep, diamonds, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    if (upProgErr) throw upProgErr;

    // Sync avatar stage based on level
    const appearance_stage = stageFor(level);
    await supabase.from('avatars').update({ appearance_stage }).eq('user_id', user.id);

    return NextResponse.json({ progress: { level, ep_in_level, total_ep }, awarded });
  } catch (err: any) {
    const msg = err?.message || 'Server error';
    const status = err?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
