import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient();

    const { data: challenge, error: cErr } = await supabase
      .from('challenges')
      .select('id, user_id, state, due_time')
      .eq('id', params.id)
      .single();
    if (cErr) throw cErr;
    if (!challenge || challenge.user_id !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (challenge.state !== 'offered') {
      return NextResponse.json({ error: 'Challenge not in offered state' }, { status: 400 });
    }

    // Ensure it will expire in 24h if no due_time present
    const patch: Record<string, any> = { state: 'declined' };
    if (!challenge.due_time) {
      patch.due_time = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }
    const { error: uErr } = await supabase
      .from('challenges')
      .update(patch)
      .eq('id', challenge.id);
    if (uErr) throw uErr;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
