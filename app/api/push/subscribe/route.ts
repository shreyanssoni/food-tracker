import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      console.warn('[push/subscribe] unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    // Validate minimal shape
    const { endpoint, keys, expirationTime } = body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      console.warn('[push/subscribe] invalid body', { hasEndpoint: !!endpoint, hasP256: !!keys?.p256dh, hasAuth: !!keys?.auth });
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }

    const supabase = createClient();
    console.log('[push/subscribe] upsert', { user_id: user.id, endpoint: String(endpoint).slice(0, 32) + '...' });
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        expiration_time: expirationTime ?? null,
      },
      { onConflict: 'endpoint' }
    );

    if (error) {
      console.error('[push/subscribe] upsert error', error);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[push/subscribe] handler error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
