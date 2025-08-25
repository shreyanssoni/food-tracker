import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getCurrentUser } from '@/utils/auth';
import { sendWebPush, type WebPushSubscription } from '@/utils/push';

// GET /api/notifications/test-both
// Optional query params: ?title=...&body=...&url=/suggestions
export async function GET(req: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const title = (req.nextUrl.searchParams.get('title') || 'Hello from Nourish').slice(0, 80);
    const body = (req.nextUrl.searchParams.get('body') || 'This is a combined focused + push notification test.').slice(0, 200);
    const url = (req.nextUrl.searchParams.get('url') || '/suggestions').trim();
    const debugFlag = req.nextUrl.searchParams.get('debug') === '1';
    const envHasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

    const supabase = createClient();
    const admin = createAdminClient();

    // 1) Create focused (in-app) notification
    // Use admin client to bypass RLS for inserting focused messages on behalf of the user
    const { data: msgRow, error: msgErr } = await admin
      .from('user_messages')
      .insert({ user_id: me.id, title, body, url })
      .select('id')
      .maybeSingle();
    if (msgErr) {
      console.error('[test-both] create message error', msgErr);
      return NextResponse.json({
        error: 'DB error (message)',
        debug: debugFlag ? { code: (msgErr as any).code, message: (msgErr as any).message, userId: me.id, envHasServiceKey } : undefined,
      }, { status: 500 });
    }

    // 2) Send push notification to this user's subscriptions
    const { data: subs, error: sErr } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, expiration_time')
      .eq('user_id', me.id)
      .order('created_at', { ascending: false });
    if (sErr) {
      console.error('[test-both] fetch subs error', sErr);
      return NextResponse.json({
        error: 'DB error (subs)',
        debug: debugFlag ? { code: (sErr as any).code, message: (sErr as any).message, userId: me.id, envHasServiceKey } : undefined,
      }, { status: 500 });
    }

    const payload = { title, body, url } as const;

    let sent = 0;
    const results: Array<{ endpoint: string; success: boolean; status: number | null }> = [];

    for (const s of subs || []) {
      const subscription: WebPushSubscription = {
        endpoint: s.endpoint,
        expirationTime: s.expiration_time ?? null,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };
      const res = await sendWebPush(subscription, payload);
      if (!res.ok) {
        const status = res.statusCode;
        // prune expired or forbidden endpoints
        if (status === 404 || status === 410 || status === 403) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
        }
        results.push({ endpoint: s.endpoint.slice(-12), success: false, status: status ?? null });
        await supabase.from('push_sends').insert({
          user_id: me.id,
          slot: 'midday',
          title: payload.title,
          body: payload.body,
          url: payload.url,
          success: false,
          status_code: status ?? null,
        });
      } else {
        sent += 1;
        results.push({ endpoint: s.endpoint.slice(-12), success: true, status: 201 });
        await supabase.from('push_sends').insert({
          user_id: me.id,
          slot: 'midday',
          title: payload.title,
          body: payload.body,
          url: payload.url,
          success: true,
          status_code: 201,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      messageId: msgRow?.id || null,
      attempted: subs?.length || 0,
      sent,
      results,
      debug: debugFlag ? { userId: me.id, subsCount: subs?.length || 0, envHasServiceKey } : undefined,
    });
  } catch (e) {
    console.error('[test-both] error', e);
    return NextResponse.json({ error: 'Server error', debug: { envHasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY } }, { status: 500 });
  }
}
