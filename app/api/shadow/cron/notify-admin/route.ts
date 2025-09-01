import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { geminiText } from '@/utils/ai';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET || '';
  const q = req.nextUrl.searchParams.get('secret') || '';
  if (!secret || q !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date();
  const start = new Date(now); start.setHours(0,0,0,0);
  const end = new Date(now); end.setHours(23,59,59,999);

  // Find all users with a pending shadow challenge due today and within 6 hours
  const { data: rows, error } = await admin
    .from('shadow_challenges')
    .select('id, user_id, challenge_text, deadline')
    .eq('status', 'pending')
    .gte('deadline', start.toISOString())
    .lte('deadline', end.toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Filter to due in next 6h
  const dueSoon = (rows || []).filter(r => {
    const ms = new Date(r.deadline).getTime() - now.getTime();
    return ms > 0 && ms <= 6 * 60 * 60 * 1000;
  });

  const origin = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') || '';
  const cronSecret = process.env.CRON_SECRET || '';
  if (!origin || !cronSecret) return NextResponse.json({ ok: false, skipped: 'missing_conf' });

  let notified = 0;
  for (const ch of dueSoon) {
    let body = `Clock's ticking. Finish: ${ch.challenge_text}`;
    try {
      const mins = Math.max(1, Math.round((new Date(ch.deadline).getTime() - now.getTime()) / 60000));
      const prompt = `Write a concise, tough-love push notification (<= 18 words) to motivate a user to finish a daily self-discipline challenge before the deadline in ${mins} minutes. Avoid emojis. Avoid quotes. Use present tense.`;
      const ai = await geminiText(prompt);
      if (typeof ai === 'string' && ai.trim()) {
        const line = ai.trim().split('\n')[0].trim();
        if (line.length <= 140) body = line;
      }
    } catch {}

    try {
      await fetch(`${origin}/api/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret },
        body: JSON.stringify({ userId: ch.user_id, focused: true, push: true, title: 'Shadow is watching', body, url: '/shadow' })
      });
      notified += 1;
    } catch {}
  }

  return NextResponse.json({ ok: true, notified, candidates: rows?.length ?? 0 });
}
