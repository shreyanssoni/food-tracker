import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient();

    // Get user progress (or defaults)
    const { data: progressRow, error: progressErr } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (progressErr) throw progressErr;

    const progress = progressRow ?? { user_id: user.id, level: 1, ep_in_level: 0, total_ep: 0, diamonds: 0 } as any;

    // ep_required for current level (fallback curve if missing)
    const { data: lvlRow, error: lvlErr } = await supabase
      .from('levels')
      .select('ep_required')
      .eq('level', progress.level)
      .maybeSingle();
    if (lvlErr) throw lvlErr;
    const ep_required = lvlRow?.ep_required ?? (100 + (progress.level - 1) * 20);

    // Get unlocked collectibles for this user
    const { data: userCollectibles, error: ucErr } = await supabase
      .from('user_collectibles')
      .select('collectible_id')
      .eq('user_id', user.id);
    if (ucErr) throw ucErr;

    return NextResponse.json({
      progress: { ...progress, ep_required },
      collectibles: userCollectibles?.map((r) => r.collectible_id) ?? [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
