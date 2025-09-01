import { NextResponse } from 'next/server';
import { requireUser } from '@/utils/auth';
import { createClient } from '@/utils/supabase/server';

// GET /api/achievements/history
export async function GET() {
  try {
    const user = await requireUser();
    const supabase = createClient();

    const { data, error } = await supabase
      .from('user_achievements')
      .select('awarded_at, meta, achievement:achievements(id, code, name, description, icon)')
      .eq('user_id', user.id)
      .order('awarded_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ items: data || [] });
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
