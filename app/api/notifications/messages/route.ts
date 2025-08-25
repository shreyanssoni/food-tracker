import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getCurrentUser } from '@/utils/auth';

// GET /api/notifications/messages
// Query: ?unread=1 to only return unread
export async function GET(req: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const unreadOnly = req.nextUrl.searchParams.get('unread') === '1';
    const admin = createAdminClient();
    let q = admin
      .from('user_messages')
      .select('id, title, body, url, read_at, created_at')
      .eq('user_id', me.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (unreadOnly) q = q.is('read_at', null);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ messages: data || [] });
  } catch (e) {
    console.error('messages list error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST /api/notifications/messages
// Allows a user to create a message for self (optional convenience)
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const title = (body?.title || '').trim();
    const msg = (body?.body || '').trim();
    const url = (body?.url || '').trim() || null;
    if (!title || !msg) return NextResponse.json({ error: 'title and body required' }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('user_messages')
      .insert({ user_id: me.id, title, body: msg, url })
      .select('id')
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (e) {
    console.error('messages create error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
