import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createClient();

    const { data: rows, error } = await supabase
      .from('user_collectibles')
      .select('collectible_id, acquired_at')
      .eq('user_id', user.id)
      .order('acquired_at', { ascending: false });
    if (error) throw error;

    const ids = (rows || []).map(r => r.collectible_id);
    let meta: Record<string, any> = {};
    if (ids.length) {
      const { data: cols, error: cErr } = await supabase
        .from('collectibles')
        .select('*')
        .in('id', ids as string[]);
      if (cErr) throw cErr;
      for (const c of cols || []) meta[c.id] = c;
    }

    const items = (rows || []).map(r => ({ ...meta[r.collectible_id], acquired_at: r.acquired_at }));
    return NextResponse.json({ items });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
