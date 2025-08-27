import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { requireUser } from '@/utils/auth';

export async function GET() {
  try {
    const user = await requireUser();
    // Use admin client to bypass RLS; route is gated by requireUser()
    const supabase = createAdminClient();

    const { data: avatar, error: aErr } = await supabase
      .from('avatars')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (aErr) throw aErr;

    const { data: equip } = await supabase
      .from('avatar_equipment')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    // Resolve equipped items metadata (equipment stores collectibles.id directly)
    const equippedIds = [equip?.weapon, equip?.armor, equip?.cosmetic, equip?.pet].filter(Boolean) as string[];
    let equippedMeta: Record<string, any> = {};
    if (equippedIds.length) {
      const { data: cols } = await supabase
        .from('collectibles')
        .select('*')
        .in('id', equippedIds);
      for (const c of cols || []) equippedMeta[c.id] = c;
    }

    // Compute imageUrl using Option B: avatars/{stage}/{appearance_key}.{ext}
    let imageUrl: string | null = null;
    try {
      if (avatar?.appearance_key) {
        const stage = avatar.appearance_stage || 'stage1';
        const ext = (avatar.appearance_ext || 'png').toLowerCase();
        const path = `${stage}/${avatar.appearance_key}.${ext}`;
        const { data: pub } = createClient().storage.from('avatars').getPublicUrl(path);
        imageUrl = pub.publicUrl || null;
      }
    } catch {}

    return NextResponse.json({ avatar, equipment: equip, equippedMeta, imageUrl });
  } catch (err: any) {
    const msg = err?.message || 'Server error';
    const status = err?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
