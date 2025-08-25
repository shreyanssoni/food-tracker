import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { computeTargets } from '@/utils/health';

export async function GET(req: NextRequest) {
  const supabase = createClient();
  // user id from session header injected by middleware or by auth() on server
  const userHeader = req.headers.get('x-user-id');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id || userHeader || null;

  if (!userId) {
    return NextResponse.json({ profile: null, targets: null }, { status: 200 });
  }

  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  const targets = prefs
    ? computeTargets({
        height_cm: prefs.height_cm,
        weight_kg: prefs.weight_kg,
        age: prefs.age,
        gender: prefs.gender,
        activity_level: prefs.activity_level,
        goal: prefs.goal,
      })
    : null;

  return NextResponse.json({ profile: prefs || null, targets });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const body = await req.json();

  // accept user from middleware header or supabase session
  const headerUser = req.headers.get('x-user-id');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = headerUser || user?.id || null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Load existing to avoid clobbering when only a subset is sent
  const { data: existing } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  const upsert = {
    user_id: userId,
    height_cm: body.height_cm ?? existing?.height_cm ?? null,
    weight_kg: body.weight_kg ?? existing?.weight_kg ?? null,
    age: body.age ?? existing?.age ?? null,
    gender: body.gender ?? existing?.gender ?? null,
    activity_level: body.activity_level ?? existing?.activity_level ?? 'sedentary',
    goal: body.goal ?? existing?.goal ?? 'maintain',
    workout_level: body.workout_level ?? existing?.workout_level ?? null,
    fat_goal_grams: body.fat_goal_grams ?? existing?.fat_goal_grams ?? null,
    carbs_goal_grams: body.carbs_goal_grams ?? existing?.carbs_goal_grams ?? null,
    // New flag: whether onboarding has been seen
    has_seen_onboarding: body.has_seen_onboarding ?? existing?.has_seen_onboarding ?? false,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('user_preferences')
    .upsert(upsert, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const targets = computeTargets(upsert);
  return NextResponse.json({ profile: data, targets });
}
