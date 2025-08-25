import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

// POST /api/admin/collectibles/grant
// Body: { user_id: string, collectible_id: string }
// Admin-only (except in development where any authenticated user can use it)
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient();
    const { data: meRow } = await supabase
      .from('app_users')
      .select('is_sys_admin')
      .eq('id', me.id)
      .maybeSingle();

    if (process.env.NODE_ENV !== 'development' && !meRow?.is_sys_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const user_id: string | undefined = body?.user_id;
    const collectible_id: string | undefined = body?.collectible_id;
    if (!user_id || !collectible_id) {
      return NextResponse.json({ error: 'user_id and collectible_id required' }, { status: 400 });
    }

    // Validate collectible exists
    const { data: col, error: cErr } = await supabase
      .from('collectibles')
      .select('id, name, is_badge, is_private, owner_user_id')
      .eq('id', collectible_id)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!col) return NextResponse.json({ error: 'Collectible not found' }, { status: 404 });

    // If private collectible owned by another user, disallow granting
    if (col.is_private && col.owner_user_id && col.owner_user_id !== user_id) {
      return NextResponse.json({ error: 'Private collectible is owned by another user' }, { status: 400 });
    }

    // Grant (idempotent)
    const { error: insErr } = await supabase
      .from('user_collectibles')
      .insert({ user_id, collectible_id, source: 'admin_grant' })
      .select('user_id')
      .maybeSingle();

    // Allow conflict as success (already owned)
    if (insErr && (insErr as any).code !== '23505') throw insErr;

    // Send notification to user (focused + push)
    try {
      const origin = (() => { try { return new URL((req as any).url).origin; } catch { return ''; } })();
      const secret = process.env.CRON_SECRET || '';
      if (origin && secret) {
        const title = 'Collectible granted';
        const body = col?.name ? `You received "${col.name}" for free` : 'You received a collectible for free';
        await fetch(`${origin}/api/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
          body: JSON.stringify({ userId: user_id, focused: true, push: true, title, body, url: '/collectibles' })
        });
      }
    } catch {}

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('admin grant collectible error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
