import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';
import { sendWebPush, type WebPushSubscription } from '@/utils/push';

export async function POST() {
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

    const res = await sendWebPush(subscription, {
      title: 'Test notification',
      body: 'If you see this, push is working!',
      url: '/suggestions',
    });

    if (!res.ok) {
      const status = res.statusCode;
      if (status === 404 || status === 410) {
        // prune expired
        await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
      }
      return NextResponse.json({ error: 'Send failed', status }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('send-test error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// Allow triggering via simple GET (useful on mobile without console)
export async function GET() {
  return POST();
}
