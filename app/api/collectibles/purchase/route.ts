import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createClient();
    const body = await req.json().catch(() => ({}));
    const { store_id, collectible_id } = body || {};

    // Find store item
    let item: any = null;
    if (store_id) {
      const { data, error } = await supabase
        .from('collectibles_store')
        .select('id, collectible_id, price, active')
        .eq('id', store_id)
        .maybeSingle();
      if (error) throw error;
      item = data;
    } else if (collectible_id) {
      const { data, error } = await supabase
        .from('collectibles_store')
        .select('id, collectible_id, price, active')
        .eq('collectible_id', collectible_id)
        .maybeSingle();
      if (error) throw error;
      item = data;
    } else {
      return NextResponse.json({ error: 'Missing store_id or collectible_id' }, { status: 400 });
    }

    if (!item || !item.active) return NextResponse.json({ error: 'Item not available' }, { status: 404 });

    // Already owned?
    const { data: owned } = await supabase
      .from('user_collectibles')
      .select('collectible_id')
      .eq('user_id', user.id)
      .eq('collectible_id', item.collectible_id)
      .maybeSingle();
    if (owned) return NextResponse.json({ error: 'Already owned', code: 'ALREADY_OWNED' }, { status: 409 });

    // Fetch collectible meta and requirements
    const [{ data: meta }, { data: reqs }, { data: meRow }] = await Promise.all([
      supabase.from('collectibles').select('*').eq('id', item.collectible_id).maybeSingle(),
      supabase.from('collectibles_requirements').select('*').eq('collectible_id', item.collectible_id).maybeSingle(),
      supabase.from('app_users').select('name').eq('id', user.id).maybeSingle(),
    ]);

    // Disallow purchasing badges; they are granted as rewards
    if (meta?.is_badge) {
      return NextResponse.json({ error: 'Badges cannot be purchased', code: 'BADGE_UNPURCHASABLE' }, { status: 400 });
    }
    // Private collectibles: only owner can purchase
    if (meta?.is_private && meta?.owner_user_id && meta.owner_user_id !== user.id) {
      return NextResponse.json({ error: 'Private collectible', code: 'PRIVATE_OWNER_ONLY' }, { status: 403 });
    }

    // Balance and gating checks
    const { data: prog, error: pErr } = await supabase
      .from('user_progress')
      .select('diamonds, level')
      .eq('user_id', user.id)
      .maybeSingle();
    if (pErr) throw pErr;
    const diamonds = prog?.diamonds ?? 0;
    const level = prog?.level ?? 1;

    // Gating: min_level and required_badge
    const minLevel = reqs?.min_level ?? 1;
    if (level < minLevel) {
      return NextResponse.json({ error: 'Level too low', code: 'LEVEL_GATE' }, { status: 403 });
    }
    if (reqs?.required_badge_id) {
      const { data: hasBadge } = await supabase
        .from('user_collectibles')
        .select('collectible_id')
        .eq('user_id', user.id)
        .eq('collectible_id', reqs.required_badge_id)
        .maybeSingle();
      if (!hasBadge) {
        return NextResponse.json({ error: 'Required badge not owned', code: 'BADGE_GATE' }, { status: 403 });
      }
    }
    // Goal completion gating (updated: rely on goal.status === 'completed')
    if (reqs?.require_goal_success && reqs?.required_goal_id) {
      const { data: goal } = await supabase
        .from('goals')
        .select('status')
        .eq('id', reqs.required_goal_id)
        .maybeSingle();
      const isCompleted = (goal?.status || '').toLowerCase() === 'completed';
      if (!isCompleted) {
        return NextResponse.json({ error: 'Goal not completed yet', code: 'GOAL_GATE' }, { status: 403 });
      }
    }

    // Diamonds check
    if (diamonds < item.price) return NextResponse.json({ error: 'Insufficient diamonds' }, { status: 400 });

    // Grant collectible and deduct diamonds
    const sharePath = meta?.public_slug ? `/api/collectibles/share/${encodeURIComponent(meta.public_slug)}` : null;
    const { error: ucErr } = await supabase
      .from('user_collectibles')
      .insert({
        user_id: user.id,
        collectible_id: item.collectible_id,
        source: 'purchase',
        awarded_to_name: meRow?.name || null,
        share_image_url: sharePath,
      });
    if (ucErr && (ucErr as any).code !== '23505') throw ucErr;

    const newDiamonds = diamonds - item.price;
    const [{ error: dUpdErr }, { error: ledErr }] = await Promise.all([
      supabase.from('user_progress').update({ diamonds: newDiamonds }).eq('user_id', user.id),
      supabase.from('diamond_ledger').insert({ user_id: user.id, delta: -item.price, reason: 'purchase' })
    ]);
    if (dUpdErr) throw dUpdErr;
    if (ledErr) throw ledErr;

    // Notify user about purchase (focused + push)
    try {
      const origin = (() => { try { return new URL((req as any).url).origin; } catch { return ''; } })();
      const secret = process.env.CRON_SECRET || '';
      if (origin && secret) {
        const title = 'Purchased collectible';
        const body = meta?.name ? `You bought "${meta.name}". Diamonds left: ${newDiamonds}` : `Purchase successful. Diamonds left: ${newDiamonds}`;
        await fetch(`${origin}/api/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
          body: JSON.stringify({ userId: user.id, focused: true, push: true, title, body, url: '/collectibles' })
        });
      }
    } catch {}

    // Return with collectible metadata (use previously fetched)
    const fullMeta = meta;
    return NextResponse.json({ success: true, diamonds: newDiamonds, item: { ...item, collectible: fullMeta } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
