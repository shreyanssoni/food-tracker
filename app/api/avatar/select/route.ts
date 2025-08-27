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
    // Extract appearance_key = 'knight_01' and ext; stage will be derived from user level.
    let appearance_key = '';
    let appearance_ext = 'png';
    try {
      const parts = appearance_stage_input.split('/');
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
    // Fetch current user level from user_progress (fallback to level 1)
    const { data: progressRow, error: progressErr } = await supabase
      .from('user_progress')
      .select('level')
      .eq('user_id', user.id)
      .maybeSingle();
    if (progressErr) throw progressErr;

    const userLevel = progressRow?.level ?? 1;

    // Derive appearance_stage exactly from level (e.g., level 12 -> stage12)
    const appearance_stage = `stage${userLevel}`;
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
        .update({ appearance_stage, appearance_key, appearance_ext, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (updErr) throw updErr;
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const status = err?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: err?.message || 'Server error' }, { status });
  }
}
