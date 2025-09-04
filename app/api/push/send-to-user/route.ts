import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';
import { sendWebPush, type WebPushSubscription, type PushPayload } from '@/utils/push';
import { sendFcmToTokens } from '@/utils/fcm';
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

    // Per-user rate limit (skip if authorized by cron secret): 5/hour, 20/day
    if (!hasSecret) {
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const [{ count: hourCount }, { count: dayCount }] = await Promise.all([
        supabase
          .from('push_sends')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', targetUserId)
          .gte('created_at', hourAgo),
        supabase
          .from('push_sends')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', targetUserId)
          .gte('created_at', dayAgo),
      ]);
      if ((hourCount ?? 0) >= 5) {
        return NextResponse.json({ error: 'Rate limit exceeded (5/hour)' }, { status: 429 });
      }
      if ((dayCount ?? 0) >= 20) {
        return NextResponse.json({ error: 'Rate limit exceeded (20/day)' }, { status: 429 });
      }
    }

    // Fetch all subscriptions for target user
    const { data: subs, error: subErr } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, expiration_time')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false });

    if (subErr) {
      console.error('fetch subs error', subErr);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }

    // Fetch FCM tokens for target user
    const { data: fcmTokens, error: fcmErr } = await supabase
      .from('fcm_tokens')
      .select('token')
      .eq('user_id', targetUserId);

    if (fcmErr) {
      console.error('fetch fcm tokens error', fcmErr);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }

    if (!subs || subs.length === 0) return NextResponse.json({ error: 'No subscription' }, { status: 404 });

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

    // Send to all subs and collect results
    let sent = 0;
    const attempted = subs.length;
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
      const success = res.ok;
      const status = res.statusCode ?? (success ? 201 : null);
      if (success) sent += 1;
      logs.push({
        user_id: targetUserId,
        slot: body.slot || 'midday',
        title: payload.title,
        body: payload.body,
        url: payload.url || '/',
        success,
        status_code: status,
      });
      if (!success && (status === 404 || status === 410 || status === 403)) {
        // prune expired
        await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
      }
    }

    // Send FCM notifications to mobile devices
    if (fcmTokens && fcmTokens.length > 0) {
      const tokens = fcmTokens.map((t: any) => t.token);
      try {
        const fcmRes = await sendFcmToTokens(tokens, {
          title: payload.title,
          body: payload.body,
          data: { url: payload.url || '/', slot: body.slot || 'midday' },
        });
        // Heuristic success: v1 returns { ok: true, results: [...] }
        const fcmSuccess = !!(fcmRes && (fcmRes.ok === true || (Array.isArray(fcmRes.results) && fcmRes.results.length > 0)));
        if (fcmSuccess) sent += tokens.length;
        
        // Log FCM sends
        for (const token of tokens) {
          logs.push({
            user_id: targetUserId,
            slot: body.slot || 'midday',
            title: payload.title,
            body: payload.body,
            url: payload.url || '/',
            success: fcmSuccess,
            status_code: fcmSuccess ? 201 : null,
          });
        }
      } catch (e) {
        console.error('FCM send error', e);
        // Log failed FCM sends
        for (const token of tokens) {
          logs.push({
            user_id: targetUserId,
            slot: body.slot || 'midday',
            title: payload.title,
            body: payload.body,
            url: payload.url || '/',
            success: false,
            status_code: null,
          });
        }
      }
    }

    if (logs.length) {
      await supabase.from('push_sends').insert(logs);
    }

    return NextResponse.json({ ok: true, attempted: (subs?.length || 0) + (fcmTokens?.length || 0), sent });
  } catch (e) {
    console.error('send-to-user error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
