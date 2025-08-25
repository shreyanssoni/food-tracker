import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createClient();

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);

    const { data, error } = await supabase
      .from('ep_ledger')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    return NextResponse.json({ entries: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
