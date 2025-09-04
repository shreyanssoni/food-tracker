import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createAdminClient } from '@/utils/supabase/admin';

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('fcm_tokens')
      .delete()
      .eq('user_id', session.user.id);
    if (error) {
      console.error('[delete-fcm-token] delete error', error);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[delete-fcm-token] error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE() {
  return POST();
}
