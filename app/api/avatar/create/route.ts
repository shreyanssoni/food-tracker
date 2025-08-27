import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { requireUser } from '@/utils/auth';

export async function POST() {
  try {
    const user = await requireUser();
    const supabase = createAdminClient();

    // If exists, return existing
    const { data: existing, error: exErr } = await supabase
      .from('avatars')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (exErr) throw exErr;
    if (existing) return NextResponse.json({ avatar: existing });

    const defaultName = (user.name || user.email?.split('@')[0] || 'Adventurer').slice(0, 32);
    const { data, error } = await supabase
      .from('avatars')
      .insert({ user_id: user.id, name: defaultName })
      .select('*')
      .single();
    if (error) throw error;

    // Ensure equipment row
    await supabase.from('avatar_equipment').upsert({ user_id: user.id }).select('user_id');

    return NextResponse.json({ avatar: data });
  } catch (err: any) {
    const msg = err?.message || 'Server error';
    const status = err?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
