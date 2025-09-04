import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createAdminClient } from '@/utils/supabase/admin';
import { sendFcmToTokens } from '@/utils/fcm';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { title, body, url } = await req.json();
    
    const supabase = createAdminClient();
    const { data: rows, error } = await supabase
      .from('fcm_tokens')
      .select('token')
      .eq('user_id', session.user.id);

    if (error) {
      console.error('[test-fcm-direct] select error', error);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }

    const tokens = (rows ?? []).map((r: any) => r.token);
    if (!tokens.length) {
      return NextResponse.json({ error: 'No FCM tokens registered for user' }, { status: 400 });
    }

    console.log('[test-fcm-direct] Sending to tokens:', tokens.length);
    const res = await sendFcmToTokens(tokens, {
      title: title || 'Nourish test push',
      body: body || 'This is a test notification from the server',
      data: { url: url || '/', type: 'test', ts: Date.now().toString() },
    });

    console.log('[test-fcm-direct] FCM result:', res);
    return NextResponse.json({ ok: true, fcm: res, tokensSent: tokens.length });
  } catch (e) {
    console.error('[test-fcm-direct] error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
