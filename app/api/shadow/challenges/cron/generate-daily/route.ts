import { NextResponse } from 'next/server';
import { requireUser } from '@/utils/auth';
import { createClient } from '@/utils/supabase/server';
import { geminiText } from '@/utils/ai';

function startEndOfToday(tz: string) {
  try {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    const start = new Date(now); start.setHours(0,0,0,0);
    const end = new Date(now); end.setHours(23,59,0,0);
    return { start, end };
  } catch {
    const now = new Date();
    const start = new Date(now); start.setHours(0,0,0,0);
    const end = new Date(now); end.setHours(23,59,0,0);
    return { start, end };
  }
}

export async function POST() {
  try {
    const user = await requireUser();
    const supabase = createClient();

    // Ensure profile activated and read prefs
    const { data: sp, error: spErr } = await supabase
      .from('shadow_profile')
      .select('id, preferences, activated_at')
      .eq('user_id', user.id)
      .single();
    if (spErr) return NextResponse.json({ error: spErr.message }, { status: 500 });
    if (!sp?.activated_at) return NextResponse.json({ ok: true, skipped: 'not_activated' });

    const prefs = (sp.preferences || {}) as any;
    const difficulty: 'easy'|'medium'|'hard' = prefs.difficulty || 'medium';
    const defaultTz = process.env.DEFAULT_TIMEZONE || process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || 'Asia/Kolkata';
    const { start, end } = startEndOfToday(defaultTz);

    // If a pending challenge already exists for today, skip
    const { data: existing, error: existErr } = await supabase
      .from('shadow_challenges')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .gte('deadline', start.toISOString())
      .lte('deadline', end.toISOString())
      .limit(1);
    if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 });
    if (existing && existing.length) return NextResponse.json({ ok: true, skipped: 'already_exists' });

    // Fallback simple generator
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
    let challenge_text = list[Math.floor(Math.random()*list.length)];

    // Try AI personalization with fallback
    try {
      const prompt = `Generate one concise, single-sentence daily self-discipline challenge for a user. Tone: tough-love, actionable. Difficulty: ${difficulty}. Output only the sentence, no quotes.`;
      const ai = await geminiText(prompt);
      if (ai && typeof ai === 'string') {
        const line = ai.trim().split('\n')[0].trim();
        if (line && line.length <= 140) challenge_text = line;
      }
    } catch {}

    const { data: row, error: insErr } = await supabase
      .from('shadow_challenges')
      .insert({
        user_id: user.id,
        shadow_profile_id: sp.id,
        challenge_text,
        deadline: end.toISOString(),
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
