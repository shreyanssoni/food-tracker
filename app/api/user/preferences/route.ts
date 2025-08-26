import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Minimal user preferences API focused on timezone (but can accept partials)
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id || req.headers.get('x-user-id') || null;

  if (!userId) return NextResponse.json({ profile: null }, { status: 200 });

  const { data: prefs, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ profile: prefs || null });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const body = await req.json().catch(() => ({}));

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id || req.headers.get('x-user-id') || null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Read existing to merge partial updates
  const { data: existing } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  const upsert: any = {
    user_id: userId,
    // We only care about timezone here but allow a few other fields to be set if sent
    timezone: body.timezone ?? existing?.timezone ?? null,
    height_cm: body.height_cm ?? existing?.height_cm ?? null,
    weight_kg: body.weight_kg ?? existing?.weight_kg ?? null,
    age: body.age ?? existing?.age ?? null,
    gender: body.gender ?? existing?.gender ?? null,
    activity_level: body.activity_level ?? existing?.activity_level ?? 'sedentary',
    goal: body.goal ?? existing?.goal ?? 'maintain',
    has_seen_onboarding: body.has_seen_onboarding ?? existing?.has_seen_onboarding ?? false,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('user_preferences')
    .upsert(upsert, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ profile: data });
}
