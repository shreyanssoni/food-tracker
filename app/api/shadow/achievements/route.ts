import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

// GET /api/shadow/achievements
// Returns the user's earned achievements with metadata, as well as available catalog
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createClient();

    const [earnedRes, catalogRes] = await Promise.all([
      supabase
        .from('user_achievements')
        .select('id, achievement_id, awarded_at, meta, achievements:achievement_id (code, name, description, icon)')
        .eq('user_id', user.id)
        .order('awarded_at', { ascending: false })
        .limit(200),
      supabase
        .from('achievements')
        .select('id, code, name, description, icon')
        .order('created_at', { ascending: true })
        .limit(200),
    ]);

    if (earnedRes.error) throw earnedRes.error;
    if (catalogRes.error) throw catalogRes.error;

    return NextResponse.json({ earned: earnedRes.data || [], catalog: catalogRes.data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
