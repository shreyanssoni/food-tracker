import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getCurrentUser } from '@/utils/auth';
import { sendWebPush, type WebPushSubscription, type PushPayload } from '@/utils/push';
import { generateMessageFor, type Slot } from '@/utils/broadcast';

// POST /api/notify
// Body:
// {
//   userId?: string,              // required if using secret or admin; otherwise defaults to current user
//   focused?: boolean,            // create in-app focused message (user_messages)
//   push?: boolean,               // send web push notification
//   title?: string,
//   body?: string,
//   url?: string,                 // must start with '/'
//   slot?: 'morning'|'midday'|'evening'|'night', // for auto-generated push content
//   timezone?: string
// }
// Auth:
// - If x-cron-secret matches CRON_SECRET, can target any user.
// - Else must be authenticated. Targeting another user requires is_sys_admin=true.
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    const provided = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret') || '';
    const hasSecret = Boolean(secret && provided && secret === provided);

    const body = (await req.json().catch(() => ({}))) as Partial<{
      userId: string;
      focused: boolean;
      push: boolean;
      title: string;
      body: string;
      url: string;
      slot: Slot;
      timezone: string;
    }>;

    const supabase = createClient();

    // Session/auth resolution
    let meId: string | null = null;
    let isAdmin = false;
    if (!hasSecret) {
      const me = await getCurrentUser();
      meId = me?.id ?? null;
      if (!meId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      const { data: meRow } = await supabase.from('app_users').select('is_sys_admin').eq('id', meId).maybeSingle();
      isAdmin = !!meRow?.is_sys_admin;
    }

    const targetUserId = body.userId || meId;
    if (!targetUserId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

    if (!hasSecret && meId && targetUserId !== meId && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const wantFocused = !!body.focused;
    const wantPush = !!body.push;
    if (!wantFocused && !wantPush) {
      return NextResponse.json({ error: 'Specify focused and/or push' }, { status: 400 });
    }

    const titleIn = (body.title || '').trim();
    const bodyIn = (body.body || '').trim();
    const urlIn = (body.url || '').trim();

    const results: Record<string, any> = {};

    // Focused in-app message
    if (wantFocused) {
      if (!titleIn || !bodyIn) return NextResponse.json({ error: 'title and body required for focused' }, { status: 400 });
      // Use admin client if targeting another user or using secret
      const db = (hasSecret || (meId && targetUserId !== meId && isAdmin)) ? createAdminClient() : supabase;
      const { data: ins, error: mErr } = await db
        .from('user_messages')
        .insert({ user_id: targetUserId, title: titleIn, body: bodyIn, url: urlIn && urlIn.startsWith('/') ? urlIn : null })
        .select('id')
        .maybeSingle();
      if (mErr) {
        console.error('focused insert error', mErr);
        return NextResponse.json({ error: 'DB error (messages)' }, { status: 500 });
      }
      results.focused = { ok: true, id: ins?.id };
    }

    // Push
    if (wantPush) {
      // Per-user rate limit unless secret/admin
      if (!hasSecret && !isAdmin) {
        const now = new Date();
        const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
        const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const [{ count: hourCount }, { count: dayCount }] = await Promise.all([
          supabase.from('push_sends').select('id', { count: 'exact', head: true }).eq('user_id', targetUserId).gte('created_at', hourAgo),
          supabase.from('push_sends').select('id', { count: 'exact', head: true }).eq('user_id', targetUserId).gte('created_at', dayAgo),
        ]);
        if ((hourCount ?? 0) >= 5) return NextResponse.json({ error: 'Rate limit exceeded (5/hour)' }, { status: 429 });
        if ((dayCount ?? 0) >= 20) return NextResponse.json({ error: 'Rate limit exceeded (20/day)' }, { status: 429 });
      }

      // Subscriptions
      const { data: subs, error: subErr } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth, expiration_time')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false });
      if (subErr) {
        console.error('subs error', subErr);
        return NextResponse.json({ error: 'DB error (subscriptions)' }, { status: 500 });
      }
      if (!subs || subs.length === 0) results.push = { ok: false, error: 'No subscription' };
      else {
        // Payload
        let payload: PushPayload | null = null;
        if (titleIn || bodyIn) {
          payload = { title: titleIn || 'Nourish', body: bodyIn || '', url: urlIn && urlIn.startsWith('/') ? urlIn : '/suggestions' };
        } else {
          const slot = body.slot;
          if (!slot) return NextResponse.json({ error: 'Provide either title/body or a slot' }, { status: 400 });
          let tz = (body.timezone || '').trim();
          if (!tz) {
            const { data: pref, error: pErr } = await supabase.from('user_preferences').select('timezone').eq('user_id', targetUserId).maybeSingle();
            if (pErr) return NextResponse.json({ error: 'DB error (prefs)' }, { status: 500 });
            tz = (pref?.timezone as string) || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';
          }
          payload = await generateMessageFor(slot, tz);
        }

        // Send to all subs
        let sent = 0;
        const logs: Array<{ user_id: string; slot: string; title: string; body: string; url: string; success: boolean; status_code: number | null }>
          = [];
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
          logs.push({ user_id: targetUserId, slot: body.slot || 'midday', title: payload.title, body: payload.body, url: payload.url || '/', success, status_code: status });
          if (!success && (status === 404 || status === 410 || status === 403)) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
          }
        }
        if (logs.length) await supabase.from('push_sends').insert(logs);
        results.push = { ok: true, attempted: subs.length, sent };
      }
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (e) {
    console.error('notify error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
