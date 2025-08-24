import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';
import { sendWebPush, type WebPushSubscription } from '@/utils/push';
import { generateMessageFor, type Slot } from '@/utils/broadcast';

async function handleSend(slot?: Slot, timezone?: string) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient();
    // Per-user rate limit: 3/hour, 8/day
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const [{ count: hourCount }, { count: dayCount }] = await Promise.all([
      supabase
        .from('push_sends')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', hourAgo),
      supabase
        .from('push_sends')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', dayAgo),
    ]);
    if ((hourCount ?? 0) >= 3) {
      return NextResponse.json({ error: 'Rate limit exceeded (3/hour)' }, { status: 429 });
    }
    if ((dayCount ?? 0) >= 8) {
      return NextResponse.json({ error: 'Rate limit exceeded (8/day)' }, { status: 429 });
    }
    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, expiration_time')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('fetch subs error', error);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }
    if (!subs || subs.length === 0) return NextResponse.json({ error: 'No subscription' }, { status: 404 });

    // Build payload: if slot provided, generate slot-specific; else use fixed test
    const payload = slot
      ? await generateMessageFor(slot, timezone || 'Asia/Kolkata')
      : { title: 'Test notification', body: 'If you see this, push is working!', url: '/suggestions' };

    let sent = 0;
    const results: Array<{ endpoint: string; success: boolean; status: number | null }> = [];
    const logs: Array<{
      user_id: string;
      slot: string;
      title: string;
      body: string;
      url: string;
      success: boolean;
      status_code: number | null;
    }> = [];
    for (const s of subs) {
      const subscription: WebPushSubscription = {
        endpoint: s.endpoint,
        expirationTime: s.expiration_time ?? null,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };
      const res = await sendWebPush(subscription, payload);
      if (!res.ok) {
        const status = res.statusCode;
        if (status === 404 || status === 410 || status === 403) {
          // prune expired
          await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
        }
        results.push({ endpoint: s.endpoint.slice(-12), success: false, status: status ?? null });
        logs.push({
          user_id: user.id,
          slot: slot || 'midday',
          title: payload.title,
          body: payload.body,
          url: payload.url || '/',
          success: false,
          status_code: status ?? null,
        });
      } else {
        sent += 1;
        results.push({ endpoint: s.endpoint.slice(-12), success: true, status: 201 });
        logs.push({
          user_id: user.id,
          slot: slot || 'midday',
          title: payload.title,
          body: payload.body,
          url: payload.url || '/',
          success: true,
          status_code: 201,
        });
      }
    }
    if (logs.length) {
      await supabase.from('push_sends').insert(logs);
    }

    return NextResponse.json({ ok: true, attempted: subs.length, sent, slot: slot || null, results });
  } catch (e) {
    console.error('send-test error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<{ slot: Slot; timezone: string }>;
  return handleSend(body.slot, body.timezone);
}

// Allow triggering via simple GET (useful on mobile without console). Supports query ?slot=morning&timezone=Asia/Kolkata
export async function GET(req: NextRequest) {
  const slotParam = (req.nextUrl.searchParams.get('slot') || '').trim() as Slot;
  const tzParam = (req.nextUrl.searchParams.get('timezone') || '').trim();
  const valid = ['morning','midday','evening','night'] as const;
  const slot = (valid as readonly string[]).includes(slotParam) ? (slotParam as Slot) : undefined;
  return handleSend(slot, tzParam || undefined);
}
