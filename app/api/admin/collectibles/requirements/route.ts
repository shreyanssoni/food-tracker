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

// PUT /api/admin/collectibles/requirements
// Body: { collectible_id: string, min_level?: number, required_badge_id?: string|null, required_goal_id?: string|null, require_goal_success?: boolean }
export async function PUT(req: NextRequest) {
  try {
    const guard = await requireAdmin();
    if ('error' in guard) return guard.error;
    const { supabase } = guard;

    const body = await req.json();
    const collectible_id = body?.collectible_id as string;
    if (!collectible_id) return NextResponse.json({ error: 'collectible_id required' }, { status: 400 });

    const payload: any = { collectible_id };
    if (typeof body?.min_level === 'number') payload.min_level = body.min_level;
    if (body?.required_badge_id !== undefined) payload.required_badge_id = body.required_badge_id;
    if (body?.required_goal_id !== undefined) payload.required_goal_id = body.required_goal_id;
    if (typeof body?.require_goal_success === 'boolean') payload.require_goal_success = body.require_goal_success;

    if (Object.keys(payload).length === 1) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { error } = await supabase
      .from('collectibles_requirements')
      .upsert(payload, { onConflict: 'collectible_id' });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('requirements PUT error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
