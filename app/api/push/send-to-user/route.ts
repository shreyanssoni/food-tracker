import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';
import { sendWebPush, type WebPushSubscription, type PushPayload } from '@/utils/push';
import { generateMessageFor, type Slot } from '@/utils/broadcast';

// POST /api/push/send-to-user
// Body options:
// {
//   userId?: string,                  // required if using secret; defaults to current user if authenticated
//   slot?: 'morning'|'midday'|'evening'|'night',
//   timezone?: string,                // optional; if omitted we read from user_preferences
//   title?: string,
//   body?: string,
//   url?: string                      // must start with '/'
// }
// Auth:
// - If header x-cron-secret or ?secret= matches CRON_SECRET, can target any userId.
// - Otherwise must be authenticated and may only target self (userId omitted or equals session user).
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    const secret = process.env.CRON_SECRET;
    const provided = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret') || '';
    const hasSecret = Boolean(secret && provided && secret === provided);

    const body = (await req.json().catch(() => ({}))) as Partial<{
      userId: string;
      slot: Slot;
      timezone: string;
      title: string;
      body: string;
      url: string;
    }>;

    // Resolve target user
    let sessionUserId: string | null = null;
    if (!hasSecret) {
      const me = await getCurrentUser();
      sessionUserId = me?.id ?? null;
      if (!sessionUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      if (body.userId && body.userId !== sessionUserId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const targetUserId = body.userId || sessionUserId;
    if (!targetUserId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // Fetch latest subscription for target user
    const { data: subRow, error: subErr } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, expiration_time')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subErr) {
      console.error('fetch sub error', subErr);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }
    if (!subRow) return NextResponse.json({ error: 'No subscription' }, { status: 404 });

    const subscription: WebPushSubscription = {
      endpoint: subRow.endpoint,
      expirationTime: subRow.expiration_time ?? null,
      keys: { p256dh: subRow.p256dh, auth: subRow.auth },
    };

    // Build payload
    let payload: PushPayload | null = null;
    const titleIn = (body.title || '').trim();
    const bodyIn = (body.body || '').trim();
    const urlIn = (body.url || '').trim();

    if (titleIn || bodyIn) {
      payload = {
        title: titleIn || 'Nourish',
        body: bodyIn || '',
        url: urlIn && urlIn.startsWith('/') ? urlIn : '/suggestions',
      };
    } else {
      // Need a slot to generate a message
      const slot = body.slot;
      if (!slot) {
        return NextResponse.json({ error: 'Provide either title/body or a slot' }, { status: 400 });
      }
      let tz = (body.timezone || '').trim();
      if (!tz) {
        const { data: pref, error: pErr } = await supabase
          .from('user_preferences')
          .select('timezone')
          .eq('user_id', targetUserId)
          .maybeSingle();
        if (pErr) {
          console.error('pref error', pErr);
          return NextResponse.json({ error: 'DB error' }, { status: 500 });
        }
        tz = (pref?.timezone as string) || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';
      }
      payload = await generateMessageFor(slot, tz);
    }

    const res = await sendWebPush(subscription, payload);

    // Log
    const success = res.ok;
    const status = res.statusCode ?? (success ? 201 : null);
    await supabase.from('push_sends').insert({
      user_id: targetUserId,
      slot: body.slot || 'midday',
      title: payload.title,
      body: payload.body,
      url: payload.url || '/',
      success,
      status_code: status,
    });

    if (!success) {
      if (status === 404 || status === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
      }
      return NextResponse.json({ error: 'Send failed', status }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('send-to-user error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
