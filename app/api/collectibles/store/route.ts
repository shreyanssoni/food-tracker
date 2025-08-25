import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createClient();

    const [{ data: progRow }, { data: items, error }] = await Promise.all([
      supabase.from('user_progress').select('diamonds, level').eq('user_id', user.id).maybeSingle(),
      supabase.from('collectibles_store')
        .select('id, collectible_id, price, active')
        .eq('active', true)
        .order('created_at', { ascending: true })
    ]);
    if (error) throw error;

    const colIds = (items || []).map(i => i.collectible_id);
    let metadata: Record<string, any> = {};
    if (colIds.length) {
      const { data: cols, error: cErr } = await supabase
        .from('collectibles')
        .select('*')
        .in('id', colIds as string[]);
      if (cErr) throw cErr;
      for (const c of cols || []) metadata[c.id] = c;
    }

    // Requirements per collectible (min_level, required_badge)
    let reqs: Record<string, any> = {};
    let badgeMeta: Record<string, { id: string; name: string }> = {};
    if (colIds.length) {
      const { data: rows, error: rErr } = await supabase
        .from('collectibles_requirements')
        .select('collectible_id, min_level, required_badge_id')
        .in('collectible_id', colIds as string[]);
      if (rErr) throw rErr;
      for (const r of rows || []) reqs[r.collectible_id] = r;
      // Fetch names for required badges if present
      const badgeIds = Array.from(new Set((rows || []).map((r: any) => r.required_badge_id).filter(Boolean)));
      if (badgeIds.length) {
        const { data: bRows, error: bErr } = await supabase
          .from('collectibles')
          .select('id, name')
          .in('id', badgeIds as string[]);
        if (bErr) throw bErr;
        for (const b of bRows || []) badgeMeta[b.id] = { id: b.id, name: b.name };
      }
    }

    const { data: owned } = await supabase
      .from('user_collectibles')
      .select('collectible_id, source')
      .eq('user_id', user.id);
    const ownedSet = new Set((owned || []).map((r: any) => r.collectible_id));
    const ownedSource: Record<string, string | null> = {};
    for (const row of owned || []) ownedSource[row.collectible_id] = row.source || null;

    const level = progRow?.level ?? 1;

    // Filter out badges from store; compute can_purchase
    const result = (items || [])
      .filter((i: any) => {
        const meta = metadata[i.collectible_id];
        if (!meta) return false;
        // Hide badges from store
        if (meta.is_badge) return false;
        // Show only private collectibles owned by this user (hide others)
        if (meta.is_private && meta.owner_user_id !== user.id) return false;
        return true;
      })
      .map(async (i: any) => {
        const meta = metadata[i.collectible_id] || null;
        const rq = reqs[i.collectible_id] || { min_level: 1, required_badge_id: null };
        const owned = ownedSet.has(i.collectible_id);
        const owned_source = owned ? (ownedSource[i.collectible_id] || null) : null;
        const hasReqBadge = rq.required_badge_id ? ownedSet.has(rq.required_badge_id) : true;
        let goalOk = true;
        if (rq.require_goal_success && rq.required_goal_id) {
          // Fetch goal and weekly success states
          const [{ data: goal }, { data: weeks }] = await Promise.all([
            supabase.from('goals').select('deadline').eq('id', rq.required_goal_id).maybeSingle(),
            supabase.rpc('fn_goal_weekly_success', { p_goal_id: rq.required_goal_id })
          ]);
          const pastDeadline = goal?.deadline ? new Date(goal.deadline) <= new Date() : false;
          const allWeeksSuccess = Array.isArray(weeks) ? weeks.every((w: any) => w.success) : false;
          goalOk = pastDeadline && allWeeksSuccess;
        }
        const can_purchase = i.active && !owned && level >= (rq.min_level ?? 1) && hasReqBadge && goalOk;
        let unavailable_reason: string | null = null;
        if (!can_purchase) {
          if (!goalOk && rq.require_goal_success) unavailable_reason = 'not_available_yet';
          else if (!hasReqBadge) unavailable_reason = 'badge_required';
          else if (level < (rq.min_level ?? 1)) unavailable_reason = 'level_required';
          else if (owned) unavailable_reason = 'already_owned';
          else if (!i.active) unavailable_reason = 'inactive';
        }
        return {
          ...i,
          collectible: meta,
          owned,
          owned_source,
          free_awarded: owned && owned_source === 'admin_grant',
          can_purchase,
          unavailable_reason,
          requirements: { ...rq, required_badge_name: rq?.required_badge_id ? (badgeMeta[rq.required_badge_id]?.name || null) : null },
        };
      });

    const resolved = await Promise.all(result);
    return NextResponse.json({ diamonds: progRow?.diamonds ?? 0, level, items: resolved });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
