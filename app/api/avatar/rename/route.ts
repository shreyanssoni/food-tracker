import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { requireUser } from '@/utils/auth';

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const supabase = createAdminClient();
    const body = await req.json().catch(() => ({}));
    let name = String(body?.name || '').trim();
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
    if (name.length > 32) name = name.slice(0, 32);

    const { error } = await supabase
      .from('avatars')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const msg = err?.message || 'Server error';
    const status = err?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
