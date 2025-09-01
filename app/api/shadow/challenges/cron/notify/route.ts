import { NextResponse } from 'next/server';
import { requireUser } from '@/utils/auth';
import { createClient } from '@/utils/supabase/server';
import { geminiText } from '@/utils/ai';

// POST /api/shadow/challenges/cron/notify
// Sends a due-soon reminder for today's pending shadow challenge using AI messaging.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const supabase = createClient();

    // Find today's pending challenge
    const now = new Date();
    const today = new Date(now);
    const start = new Date(today); start.setHours(0,0,0,0);
    const end = new Date(today); end.setHours(23,59,59,999);

    const { data: rows, error } = await supabase
      .from('shadow_challenges')
      .select('id, challenge_text, deadline')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .gte('deadline', start.toISOString())
      .lte('deadline', end.toISOString())
      .order('deadline', { ascending: true })
      .limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!rows || !rows.length) return NextResponse.json({ ok: true, skipped: 'none_pending' });

    const ch = rows[0];
    const due = new Date(ch.deadline);

    // Only notify if due within the next 6 hours and not already passed
    const msLeft = due.getTime() - now.getTime();
    if (msLeft <= 0 || msLeft > 6 * 60 * 60 * 1000) {
      return NextResponse.json({ ok: true, skipped: 'not_in_window' });
    }

    // Build message via AI (with fallback)
    let body = `Clock's ticking. Finish: ${ch.challenge_text}`;
    try {
      const mins = Math.max(1, Math.round(msLeft / 60000));
      const prompt = `Write a concise, tough-love push notification (<= 18 words) to motivate a user to finish a daily self-discipline challenge before the deadline in ${mins} minutes. Avoid emojis. Avoid quotes. Use present tense.`;
      const ai = await geminiText(prompt);
      if (typeof ai === 'string' && ai.trim()) {
        const line = ai.trim().split('\n')[0].trim();
        if (line.length <= 140) body = line;
      }
    } catch {}

    const origin = (() => { try { return new URL((req as any).url).origin; } catch { return ''; } })();
    const secret = process.env.CRON_SECRET || '';
    if (!origin || !secret) return NextResponse.json({ ok: false, skipped: 'missing_notify_conf' });

    try {
      await fetch(`${origin}/api/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
        body: JSON.stringify({ userId: user.id, focused: true, push: true, title: 'Shadow is watching', body, url: '/shadow' })
      });
    } catch {}

    return NextResponse.json({ ok: true, notified: true, msLeft });
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
