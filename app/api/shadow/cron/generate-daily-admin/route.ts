import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
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

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET || '';
  const q = req.nextUrl.searchParams.get('secret') || '';
  if (!secret || q !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const defaultTz = process.env.DEFAULT_TIMEZONE || process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || 'Asia/Kolkata';
  const { start, end } = startEndOfToday(defaultTz);

  // Fetch activated profiles
  const { data: profiles, error: pErr } = await admin
    .from('shadow_profile')
    .select('id, user_id, preferences, activated_at')
    .not('activated_at', 'is', null)
    .limit(10000);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  let created = 0;
  for (const sp of profiles || []) {
    // If pending exists for today, skip
    const { data: existing } = await admin
      .from('shadow_challenges')
      .select('id')
      .eq('user_id', sp.user_id)
      .eq('status', 'pending')
      .gte('deadline', start.toISOString())
      .lte('deadline', end.toISOString())
      .limit(1);
    if (existing && existing.length) continue;

    const prefs = (sp.preferences || {}) as any;
    const difficulty: 'easy'|'medium'|'hard' = prefs.difficulty || 'medium';
    const candidates: Record<string, string[]> = {
      easy: ['Drink 8 glasses of water today','Walk 4000 steps today','Sleep by 11:00 PM today'],
      medium: ['Wake up at 6:30 AM tomorrow','Eat under 30g fat today','No sugar after 6 PM today'],
      hard: ['Run 5km today','No eating after 7 PM today','Wake up at 5:30 AM tomorrow'],
    };
    const list = candidates[difficulty] || candidates.medium;
    let challenge_text = list[Math.floor(Math.random()*list.length)];
    try {
      const prompt = `Generate one concise, single-sentence daily self-discipline challenge for a user. Tone: tough-love, actionable. Difficulty: ${difficulty}. Output only the sentence, no quotes.`;
      const ai = await geminiText(prompt);
      if (ai && typeof ai === 'string') {
        const line = ai.trim().split('\n')[0].trim();
        if (line && line.length <= 140) challenge_text = line;
      }
    } catch {}

    const { error: insErr } = await admin
      .from('shadow_challenges')
      .insert({ user_id: sp.user_id, shadow_profile_id: sp.id, challenge_text, deadline: end.toISOString() });
    if (!insErr) created += 1;
  }

  return NextResponse.json({ ok: true, created });
}
