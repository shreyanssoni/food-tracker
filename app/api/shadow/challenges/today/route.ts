import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireUser } from '@/utils/auth';

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = createClient();
    const now = new Date();
    const start = new Date(now); start.setHours(0,0,0,0);
    const end = new Date(now); end.setHours(23,59,59,999);

    const { data, error } = await supabase
      .from('shadow_challenges')
      .select('id, challenge_text, deadline, status, ep_awarded')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .gte('deadline', start.toISOString())
      .lte('deadline', end.toISOString())
      .order('deadline', { ascending: true })
      .limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const row = data && data[0] ? data[0] : null;
    return NextResponse.json({ challenge: row });
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
