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

// PUT /api/admin/collectibles/store
// Body: { collectible_id: string, price: number, active: boolean }
export async function PUT(req: NextRequest) {
  try {
    const guard = await requireAdmin();
    if ('error' in guard) return guard.error;
    const { supabase } = guard;

    const body = await req.json();
    const collectible_id = body?.collectible_id as string;
    if (!collectible_id) return NextResponse.json({ error: 'collectible_id required' }, { status: 400 });

    const price = typeof body?.price === 'number' ? body.price : 0;
    const active = Boolean(body?.active);

    const { error } = await supabase
      .from('collectibles_store')
      .upsert({ collectible_id, price, active }, { onConflict: 'collectible_id' });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('store PUT error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
