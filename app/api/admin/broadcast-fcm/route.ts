import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { sendFcmToTokens } from '@/utils/fcm';

function unauthorized(msg = 'Unauthorized') {
  return NextResponse.json({ error: msg }, { status: 401 });
}

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function handleBroadcast(req: NextRequest) {
  // Simple secret-based auth (works for Vercel Cron or manual calls). Alternatively, wire an admin role.
  const secret = process.env.CRON_SECRET;
  const authz = req.headers.get('authorization') || '';
  const headerSecret = req.headers.get('x-cron-secret') || '';
  const token = authz.startsWith('Bearer ')
    ? authz.substring('Bearer '.length)
    : '';
  if (!secret || (token !== secret && headerSecret !== secret)) {
    return unauthorized();
  }

  let body: any = {};
  try {
    if (req.method !== 'GET') body = await req.json();
  } catch {}

  const title = body.title || 'Broadcast';
  const message = body.body || 'This is a broadcast notification';
  const data: Record<string, string> = body.data || {};
  const limit = Math.max(1, Math.min(1000, Number(body.limit) || 0)) || undefined; // optional testing limit
  const dryRun = Boolean(body.dryRun);

  const supabase = createAdminClient();
  const query = supabase.from('fcm_tokens').select('token');
  const { data: rows, error } = await (limit ? query.limit(limit) : query);
  if (error) {
    console.error('[broadcast-fcm] select error', error);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  const allTokens = Array.from(new Set((rows || []).map((r: any) => r.token).filter(Boolean)));
  if (!allTokens.length) {
    return badRequest('No FCM tokens found');
  }

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, tokenCount: allTokens.length });
  }

  // Batch tokens to be courteous; our v1 sender sends per-token anyway, but this keeps payloads manageable for legacy.
  const batches = chunk(allTokens, 500);
  const results: any[] = [];
  let success = 0;
  let failure = 0;

  for (const batch of batches) {
    try {
      const res = await sendFcmToTokens(batch, { title, body: message, data });
      results.push(res);
      // Try to count success/failure heuristically
      if (res && Array.isArray(res.results)) {
        for (const r of res.results) {
          if (r && (r.name || r.messageId || r.ok === true)) success++;
          else if (r && r.ok === false) failure++;
        }
      } else if (res && typeof res.success === 'number') {
        success += res.success;
      }
    } catch (e: any) {
      console.error('[broadcast-fcm] send error', e?.message || e);
      failure += batch.length;
      results.push({ ok: false, error: String(e) });
    }
  }

  return NextResponse.json({ ok: true, tokens: allTokens.length, batches: batches.length, success, failure, results });
}

export async function POST(req: NextRequest) {
  return handleBroadcast(req);
}

export async function GET(req: NextRequest) {
  // Allow GET with defaults for quick testing
  return handleBroadcast(req);
}
