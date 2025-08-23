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

  const upsert = {
    user_id: userId,
    height_cm: body.height_cm ?? null,
    weight_kg: body.weight_kg ?? null,
    age: body.age ?? null,
    gender: body.gender ?? null,
    activity_level: body.activity_level ?? 'sedentary',
    goal: body.goal ?? 'maintain',
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
