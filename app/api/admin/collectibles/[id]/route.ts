import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  const supabase = createClient();
  const { data: me } = await supabase.from('app_users').select('is_sys_admin').eq('id', user.id).maybeSingle();
  if (process.env.NODE_ENV !== 'development' && !me?.is_sys_admin) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) } as const;
  }
  return { supabase } as const;
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const guard = await requireAdmin();
    if ('error' in guard) return guard.error;
    const { supabase } = guard;

    const id = params.id;
    const body = await req.json();
    const patch: any = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.icon !== undefined) patch.icon = body.icon;
    if (body.rarity !== undefined) patch.rarity = body.rarity;
    if (body.is_badge !== undefined) patch.is_badge = !!body.is_badge;

    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

    const { error } = await supabase.from('collectibles').update(patch).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('collectibles PUT error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const guard = await requireAdmin();
    if ('error' in guard) return guard.error;
    const { supabase } = guard;
    const id = params.id;

    // delete dependent rows first if needed (requirements, store)
    await supabase.from('collectibles_requirements').delete().eq('collectible_id', id);
    await supabase.from('collectibles_store').delete().eq('collectible_id', id);
    const { error } = await supabase.from('collectibles').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('collectibles DELETE error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
