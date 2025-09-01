import { NextResponse } from 'next/server';
import { requireUser } from '@/utils/auth';
import { createClient } from '@/utils/supabase/server';

function endOfTodayInTZ(tz: string) {
  try {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    const end = new Date(now);
    end.setHours(23, 59, 0, 0);
    // convert to ISO in local tz by adjusting offset
    return new Date(end);
  } catch {
    const end = new Date();
    end.setHours(23, 59, 0, 0);
    return end;
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const { prompt, deadline, tz } = body as { prompt?: string; deadline?: string; tz?: string };

    const supabase = createClient();

    // Ensure shadow_profile exists and is activated
    const { data: sp, error: spErr } = await supabase
      .from('shadow_profile')
      .select('id, preferences, activated_at, shadow_ep')
      .eq('user_id', user.id)
      .single();
    if (spErr) return NextResponse.json({ error: spErr.message }, { status: 500 });
    if (!sp?.activated_at) return NextResponse.json({ error: 'Shadow not activated' }, { status: 400 });

    const prefs = (sp.preferences || {}) as any;
    const difficulty: 'easy'|'medium'|'hard' = prefs.difficulty || 'medium';

    // Fallback generator (placeholder for AI routing)
    const defaultTz = process.env.DEFAULT_TIMEZONE || process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || 'Asia/Kolkata';
    const targetTz = tz || defaultTz;
    const dueAt = deadline ? new Date(deadline) : endOfTodayInTZ(targetTz);

    const candidates: Record<string, string[]> = {
      easy: [
        'Drink 8 glasses of water today',
        'Walk 4000 steps today',
        'Sleep by 11:00 PM today',
      ],
      medium: [
        'Wake up at 6:30 AM tomorrow',
        'Eat under 30g fat today',
        'No sugar after 6 PM today',
      ],
      hard: [
        'Run 5km today',
        'No eating after 7 PM today',
        'Wake up at 5:30 AM tomorrow',
      ],
    };
    const list = candidates[difficulty] || candidates.medium;
    const challenge_text = prompt || list[Math.floor(Math.random()*list.length)];

    const { data: row, error: insErr } = await supabase
      .from('shadow_challenges')
      .insert({
        user_id: user.id,
        shadow_profile_id: sp.id,
        challenge_text,
        deadline: dueAt.toISOString(),
      })
      .select('*')
      .single();

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, challenge: row });
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
