import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

// GET /api/admin/collectibles
// Returns collectibles with store pricing and access requirements
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

    // Use explicit relationship names to avoid ambiguity
    // Filter for system collectibles only (owner_user_id is null)
    const { data, error } = await supabase
      .from('collectibles')
      .select(`
        id, name, icon, rarity, is_badge, is_private, owner_user_id,
        collectibles_store(id, price, active, created_at),
        collectibles_requirements!collectibles_requirements_collectible_id_fkey(collectible_id, min_level, required_badge_id, required_goal_id, require_goal_success)
      `)
      .is('owner_user_id', null)
      .order('name', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ ok: true, collectibles: data ?? [] });
  } catch (e) {
    console.error('admin collectibles GET error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST /api/admin/collectibles
// Body: { name: string, icon?: string, rarity?: 'common'|'rare'|'epic'|'legendary', is_badge?: boolean,
//         price?: number, active?: boolean,
//         min_level?: number, required_badge_id?: string | null, required_goal_id?: string | null, require_goal_success?: boolean }
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
    const name: string | undefined = body?.name;
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

    const ins = {
      name,
      icon: body?.icon ?? null,
      rarity: body?.rarity ?? 'common',
      is_badge: Boolean(body?.is_badge) || false,
      is_private: false,
      owner_user_id: null,
    } as const;

    const { data: created, error: cErr } = await supabase
      .from('collectibles')
      .insert(ins)
      .select('id')
      .single();
    if (cErr) throw cErr;

    const id = created!.id as string;

    // Optionally upsert store pricing
    if (typeof body?.price === 'number' || typeof body?.active === 'boolean') {
      const price = typeof body?.price === 'number' ? body.price : 0;
      const active = Boolean(body?.active);
      const { error: sErr } = await supabase
        .from('collectibles_store')
        .upsert({ collectible_id: id, price, active }, { onConflict: 'collectible_id' });
      if (sErr) throw sErr;
    }

    // Optionally upsert requirements
    if (
      typeof body?.min_level === 'number' ||
      body?.required_badge_id !== undefined ||
      body?.required_goal_id !== undefined ||
      typeof body?.require_goal_success === 'boolean'
    ) {
      const payload: any = {
        collectible_id: id,
        min_level: typeof body?.min_level === 'number' ? body.min_level : 1,
        required_badge_id: body?.required_badge_id ?? null,
        required_goal_id: body?.required_goal_id ?? null,
        require_goal_success: Boolean(body?.require_goal_success) || false,
      };
      const { error: rErr } = await supabase
        .from('collectibles_requirements')
        .upsert(payload, { onConflict: 'collectible_id' });
      if (rErr) throw rErr;
    }

    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error('admin collectibles POST error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
