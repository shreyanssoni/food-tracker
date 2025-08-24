import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';
import { sendWebPush, type WebPushSubscription } from '@/utils/push';

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient();

    // Verify caller is sys admin
    const { data: me, error: meErr } = await supabase
      .from('app_users')
      .select('is_sys_admin')
      .eq('id', user.id)
      .maybeSingle();
    if (meErr) {
      console.error('meErr', meErr);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }
    if (!me?.is_sys_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get all sysadmin IDs
    const { data: admins, error: aErr } = await supabase
      .from('app_users')
      .select('id')
      .eq('is_sys_admin', true);
    if (aErr) {
      console.error('admin list error', aErr);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }
    const adminIds = (admins || []).map((a) => a.id);
    if (adminIds.length === 0) return NextResponse.json({ ok: true, sent: 0 });

    // Fetch subscriptions for admins
    const { data: subs, error: sErr } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, expiration_time')
      .in('user_id', adminIds);
    if (sErr) {
      console.error('subs error', sErr);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }

    let sent = 0;
    for (const row of subs || []) {
      const subscription: WebPushSubscription = {
        endpoint: row.endpoint,
        expirationTime: row.expiration_time ?? null,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      const payload = {
        title: 'Admin test notification',
        body: 'This went to sys admins only.',
        url: '/suggestions',
      } as const;
      const res = await sendWebPush(subscription, payload);
      if (!res.ok) {
        const status = res.statusCode;
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
        }
        await supabase.from('push_sends').insert({
          user_id: null,
          slot: 'midday',
          title: payload.title,
          body: payload.body,
          url: payload.url,
          success: false,
          status_code: res.statusCode ?? null,
        });
      } else {
        sent += 1;
        await supabase.from('push_sends').insert({
          user_id: null,
          slot: 'midday',
          title: payload.title,
          body: payload.body,
          url: payload.url,
          success: true,
          status_code: 201,
        });
      }
    }

    return NextResponse.json({ ok: true, sent });
  } catch (e) {
    console.error('send-test-admin error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
