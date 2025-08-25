import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/utils/auth';
import { createAdminClient } from '@/utils/supabase/admin';

// GET /api/notifications/test-focused
// Optional query params: ?title=...&body=...&url=/suggestions&debug=1
export async function GET(req: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const title = (req.nextUrl.searchParams.get('title') || 'Hello from Nourish').slice(0, 80);
    const body = (req.nextUrl.searchParams.get('body') || 'This is a focused notification test.').slice(0, 200);
    const url = (req.nextUrl.searchParams.get('url') || '/suggestions').trim() || null;
    const debug = req.nextUrl.searchParams.get('debug') === '1';

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('user_messages')
      .insert({ user_id: me.id, title, body, url })
      .select('id, title, body, url, created_at')
      .maybeSingle();

    if (error) {
      console.error('[test-focused] insert error', error);
      return NextResponse.json({
        error: 'DB error (message)',
        debug: debug ? { code: (error as any).code, message: (error as any).message, envHasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY } : undefined,
      }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: data });
  } catch (e) {
    console.error('[test-focused] error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
