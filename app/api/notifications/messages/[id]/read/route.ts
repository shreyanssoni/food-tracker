import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getCurrentUser } from '@/utils/auth';

// POST /api/notifications/messages/[id]/read
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const id = params.id;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('user_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', me.id);
    if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('mark read error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
