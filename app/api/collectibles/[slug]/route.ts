import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

// GET /api/collectibles/[slug]
// Returns collectible details if the current user owns it
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createClient();

    const slug = decodeURIComponent(params.slug || '').trim();
    if (!slug) return NextResponse.json({ error: 'Bad slug' }, { status: 400 });

    const { data: col, error: cErr } = await supabase
      .from('collectibles')
      .select('*')
      .eq('public_slug', slug)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!col) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: owned } = await supabase
      .from('user_collectibles')
      .select('awarded_to_name, acquired_at')
      .eq('user_id', user.id)
      .eq('collectible_id', col.id)
      .maybeSingle();

    if (!owned) return NextResponse.json({ error: 'Locked' }, { status: 403 });

    return NextResponse.json({ collectible: { ...col, ...owned } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
