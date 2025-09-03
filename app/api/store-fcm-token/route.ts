import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createAdminClient } from '@/utils/supabase/admin';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { token, platform } = await req.json();
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('fcm_tokens')
      .upsert(
        {
          user_id: session.user.id,
          token,
          platform: platform ?? 'android',
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,token' }
      );

    if (error) {
      console.error('[store-fcm-token] upsert error', error);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[store-fcm-token] error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
