import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/utils/auth';
import { createAdminClient } from '@/utils/supabase/admin';

// POST /api/notifications/messages/read-all
export async function POST(_req: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { error } = await admin
      .from('user_messages')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
      .eq('user_id', me.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('read-all error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
