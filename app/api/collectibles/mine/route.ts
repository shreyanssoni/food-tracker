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
    let goalLinkByCollectible: Record<string, string | null> = {};
    if (ids.length) {
      // Fetch collectibles metadata we care about
      const { data: cols, error: cErr } = await supabase
        .from('collectibles')
        .select('id, name, icon, rarity, public_slug, lore, story_title, story_md, og_image_url, is_badge, is_private, owner_user_id')
        .in('id', ids as string[]);
      if (cErr) throw cErr;
      for (const c of cols || []) meta[c.id] = c;

      // Fetch goal association (if any) for these collectibles
      const { data: gcs, error: gcErr } = await supabase
        .from('goal_collectibles')
        .select('goal_id, collectible_id')
        .in('collectible_id', ids as string[]);
      if (gcErr) throw gcErr;
      for (const gc of gcs || []) goalLinkByCollectible[gc.collectible_id] = gc.goal_id;
    }

    const items = (rows || []).map(r => {
      const c = meta[r.collectible_id] || {};
      const goal_id = goalLinkByCollectible[r.collectible_id] || null;
      const is_goal_collectible = !!goal_id;
      const is_user_created = !!c?.is_private && (c?.owner_user_id === user.id);
      return {
        ...c,
        acquired_at: r.acquired_at,
        goal_id,
        is_goal_collectible,
        is_user_created,
      };
    });
    return NextResponse.json({ items });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
