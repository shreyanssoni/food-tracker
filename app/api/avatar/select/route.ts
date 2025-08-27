import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { requireUser } from '@/utils/auth';

// Sets or updates the user's initial avatar selection.
// Expects: { appearance_stage: string }
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const supabase = createAdminClient();
    const body = await req.json().catch(() => ({}));
    const appearance_stage_input = String(body?.appearance_stage || '').trim();
    if (!appearance_stage_input) {
      return NextResponse.json({ error: 'appearance_stage required' }, { status: 400 });
    }
    // Option B: appearance_stage is actually the storage path like 'stage1/knight_01.png'
    // Extract appearance_key = 'knight_01'
    let appearance_key = '';
    let appearance_stage = 'stage1';
    let appearance_ext = 'png';
    try {
      const parts = appearance_stage_input.split('/');
      // stage folder is first segment (e.g., 'stage1')
      if (parts[0]) appearance_stage = parts[0];
      const filename = parts[parts.length - 1] || '';
      if (filename.includes('.')) {
        appearance_key = filename.slice(0, filename.lastIndexOf('.'));
        appearance_ext = filename.split('.').pop()!.toLowerCase();
      } else {
        appearance_key = filename;
      }
    } catch {}
    if (!appearance_key) {
      return NextResponse.json({ error: 'Invalid avatar asset path' }, { status: 400 });
    }
    // Ensure row exists and set initial fields if missing
    const { data: existing, error: getErr } = await supabase
      .from('avatars')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (getErr) throw getErr;

    if (!existing) {
      // Insert minimal fields; let DB defaults fill the rest
      const defaultName = (user.name || user.email?.split('@')[0] || 'Adventurer').slice(0, 32);
      const { error: insErr } = await supabase
        .from('avatars')
        .insert({ user_id: user.id, name: defaultName, appearance_stage, appearance_key, appearance_ext });
      if (insErr) throw insErr;
    } else {
      const { error: updErr } = await supabase
        .from('avatars')
        .update({ appearance_stage, appearance_key, appearance_ext })
        .eq('user_id', user.id);
      if (updErr) throw updErr;
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const status = err?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: err?.message || 'Server error' }, { status });
  }
}
