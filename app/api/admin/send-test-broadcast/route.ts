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
  const { data: rows, error } = await supabase
    .from('fcm_tokens')
    .select('token')
    .limit(limit);
  if (error) {
    console.error('[send-test-broadcast] select error', error);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  const tokens = Array.from(new Set((rows || []).map((r: any) => r.token).filter(Boolean)));
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
