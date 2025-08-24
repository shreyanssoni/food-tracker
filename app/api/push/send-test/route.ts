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
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, expiration_time')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('fetch sub error', error);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'No subscription' }, { status: 404 });

    const subscription: WebPushSubscription = {
      endpoint: data.endpoint,
      expirationTime: data.expiration_time ?? null,
      keys: { p256dh: data.p256dh, auth: data.auth },
    };

    // Build payload: if slot provided, generate slot-specific; else use fixed test
    const payload = slot
      ? await generateMessageFor(slot, timezone || 'Asia/Kolkata')
      : { title: 'Test notification', body: 'If you see this, push is working!', url: '/suggestions' };

    const res = await sendWebPush(subscription, payload);

    if (!res.ok) {
      const status = res.statusCode;
      if (status === 404 || status === 410) {
        // prune expired
        await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
      }
      return NextResponse.json({ error: 'Send failed', status }, { status: 502 });
    }

    return NextResponse.json({ ok: true, slot: slot || null });
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
