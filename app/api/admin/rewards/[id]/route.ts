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
    
    if (body.kind !== undefined) patch.kind = body.kind;
    if (body.amount !== undefined) patch.amount = body.amount;
    if (body.collectible_id !== undefined) patch.collectible_id = body.collectible_id;
    if (body.unlock_rule !== undefined) patch.unlock_rule = body.unlock_rule;
    if (body.unlock_level !== undefined) patch.unlock_level = body.unlock_level;
    if (body.unlock_ep !== undefined) patch.unlock_ep = body.unlock_ep;

    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

    const { error } = await supabase.from('rewards').update(patch).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('rewards PUT error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const guard = await requireAdmin();
    if ('error' in guard) return guard.error;
    const { supabase } = guard;
    const id = params.id;

    const { error } = await supabase.from('rewards').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('rewards DELETE error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
