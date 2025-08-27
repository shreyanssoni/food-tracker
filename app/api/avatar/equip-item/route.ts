import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { requireUser } from '@/utils/auth';

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const supabase = createAdminClient();
    const body = await req.json().catch(() => ({}));
    const collectible_id = String(body?.collectible_id || '');
    const slot = String(body?.slot || '');
    if (!collectible_id) return NextResponse.json({ error: 'collectible_id required' }, { status: 400 });
    if (!['weapon','armor','cosmetic','pet'].includes(slot)) {
      return NextResponse.json({ error: 'Invalid slot' }, { status: 400 });
    }

    // Ensure collectible exists and is not a badge
    const { data: col, error: colErr } = await supabase
      .from('collectibles')
      .select('id, is_badge')
      .eq('id', collectible_id)
      .maybeSingle();
    if (colErr) throw colErr;
    if (!col) return NextResponse.json({ error: 'Collectible not found' }, { status: 404 });
    if (col.is_badge) return NextResponse.json({ error: 'Badges cannot be equipped' }, { status: 400 });

    // Verify ownership of collectible
    const { data: owned, error: ownErr } = await supabase
      .from('user_collectibles')
      .select('collectible_id')
      .eq('user_id', user.id)
      .eq('collectible_id', collectible_id)
      .maybeSingle();
    if (ownErr) throw ownErr;
    if (!owned) return NextResponse.json({ error: 'You do not own this collectible' }, { status: 403 });

    // Ensure equipment row exists and read current
    const { data: eqRow } = await supabase
      .from('avatar_equipment')
      .select('user_id, weapon, armor, cosmetic, pet')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!eqRow) {
      await supabase.from('avatar_equipment').insert({ user_id: user.id }).select('user_id');
    }

    // If same item already equipped, return ok (idempotent)
    const current = (eqRow as any)?.[slot] as string | null | undefined;
    if (current === collectible_id) {
      return NextResponse.json({ ok: true });
    }

    // Auto-unequip/replace any previous in this slot, then equip this one
    const updates: any = { updated_at: new Date().toISOString() };
    updates[slot] = collectible_id;

    await supabase.from('avatar_equipment').update(updates).eq('user_id', user.id);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const msg = err?.message || 'Server error';
    const status = err?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
