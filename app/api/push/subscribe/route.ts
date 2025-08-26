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
    console.log('[push/subscribe] upsert-safe', { user_id: user.id, endpoint: String(endpoint).slice(0, 32) + '...' });

    // 1) Check if an entry already exists for this endpoint
    const { data: existing, error: selErr } = await supabase
      .from('push_subscriptions')
      .select('id, user_id')
      .eq('endpoint', endpoint)
      .maybeSingle();
    if (selErr) {
      console.error('[push/subscribe] select error', selErr);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }

    // 2) If exists, delete it first (avoids UPDATE RLS)
    if (existing?.id) {
      const { error: delErr } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('id', existing.id);
      if (delErr) {
        console.error('[push/subscribe] delete error', delErr);
        return NextResponse.json({ error: 'DB error' }, { status: 500 });
      }
    }

    // 3) Insert fresh row
    const { error: insErr } = await supabase.from('push_subscriptions').insert({
      user_id: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      expiration_time: expirationTime ?? null,
    });
    if (insErr) {
      console.error('[push/subscribe] insert error', insErr);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[push/subscribe] handler error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
