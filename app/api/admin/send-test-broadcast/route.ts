import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createAdminClient } from '@/utils/supabase/admin';
import { sendFcmToTokens } from '@/utils/fcm';

function forbidden(msg = 'Forbidden') {
  return NextResponse.json({ error: msg }, { status: 403 });
}

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: NextRequest) {
  // Admin check via allowlist (comma-separated user IDs)
  const session = await auth();
  const uid = session?.user?.id || '';
  const allow = (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!uid || !allow.includes(uid)) {
    return forbidden();
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const title = body.title || 'Nourish broadcast (test)';
  const message = body.body || 'This is a test broadcast notification';
  const data: Record<string, string> = body.data || { type: 'broadcast_test' };
  const limit = Math.max(1, Math.min(1000, Number(body.limit) || 3));
  const dryRun = Boolean(body.dryRun);

  const supabase = createAdminClient();
  // Fetch current user's tokens first
  const meRes = await supabase
    .from('fcm_tokens')
    .select('token')
    .eq('user_id', uid)
    .limit(limit);
  if (meRes.error) {
    console.error('[send-test-broadcast] select(me) error', meRes.error);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
  const meTokens = Array.from(new Set((meRes.data || []).map((r: any) => r.token).filter(Boolean)));

  let tokens: string[] = [...meTokens];
  const remaining = Math.max(0, limit - tokens.length);
  if (remaining > 0) {
    const othersRes = await supabase
      .from('fcm_tokens')
      .select('token')
      .not('token', 'in', `(${tokens.map(t => `'${t.replace(/'/g, "''")}'`).join(',') || "''"})`)
      .limit(remaining);
    if (othersRes.error) {
      console.error('[send-test-broadcast] select(others) error', othersRes.error);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }
    const otherTokens = Array.from(new Set((othersRes.data || []).map((r: any) => r.token).filter(Boolean)));
    tokens = Array.from(new Set([...tokens, ...otherTokens]));
  }
  if (!tokens.length) {
    return badRequest('No FCM tokens found');
  }

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, tokenCount: tokens.length });
  }

  // send in small batches, though our util loops per token for v1
  const batches = chunk(tokens, 500);
  const results: any[] = [];
  for (const b of batches) {
    const res = await sendFcmToTokens(b, { title, body: message, data });
    results.push(res);
  }

  return NextResponse.json({ ok: true, tokens: tokens.length, results });
}
