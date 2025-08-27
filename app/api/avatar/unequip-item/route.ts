import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { requireUser } from '@/utils/auth';

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const supabase = createAdminClient();
    const body = await req.json().catch(() => ({}));
    const slot = String(body?.slot || '');
    if (!['weapon','armor','cosmetic','pet'].includes(slot)) {
      return NextResponse.json({ error: 'Invalid slot' }, { status: 400 });
    }

    const updates: any = { updated_at: new Date().toISOString() };
    updates[slot] = null;
    await supabase.from('avatar_equipment').update(updates).eq('user_id', user.id);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const msg = err?.message || 'Server error';
    const status = err?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
