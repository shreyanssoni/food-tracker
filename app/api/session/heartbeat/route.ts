import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

function clientIp(req: NextRequest) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    (req as any).ip ||
    '0.0.0.0'
  );
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Partial<{
      device_id: string;
      push_endpoint: string | null;
    }>;

    const deviceId = (body.device_id || '').trim();
    if (!deviceId) return NextResponse.json({ error: 'device_id required' }, { status: 400 });

    const pushEndpoint = body.push_endpoint || null;
    const ua = req.headers.get('user-agent') || '';
    const ip = clientIp(req);

    const supabase = createClient();

    // Fetch existing session for this device
    const { data: existing, error: selErr } = await supabase
      .from('device_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('device_id', deviceId)
      .maybeSingle();
    if (selErr) {
      console.error('session select error', selErr);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 days

    if (existing) {
      const expired = existing.expires_at ? new Date(existing.expires_at) < now : false;
      if (expired) {
        // Mark inactive and prune push endpoint
        await supabase
          .from('device_sessions')
          .update({ active: false, last_seen: now.toISOString() })
          .eq('id', existing.id);
        if (existing.push_endpoint) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', existing.push_endpoint);
        }
        return NextResponse.json({ expired: true }, { status: 401 });
      }
      // Refresh session
      const { error: updErr } = await supabase
        .from('device_sessions')
        .update({
          push_endpoint: pushEndpoint,
          user_agent: ua,
          ip,
          last_seen: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          active: true,
        })
        .eq('id', existing.id);
      if (updErr) {
        console.error('session update error', updErr);
        return NextResponse.json({ error: 'DB error' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, refreshed: true, expires_at: expiresAt.toISOString() });
    }

    // Create new session
    const { error: insErr } = await supabase.from('device_sessions').insert({
      user_id: user.id,
      device_id: deviceId,
      push_endpoint: pushEndpoint,
      user_agent: ua,
      ip,
      started_at: now.toISOString(),
      last_seen: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      active: true,
    });
    if (insErr) {
      console.error('session insert error', insErr);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, created: true, expires_at: expiresAt.toISOString() });
  } catch (e) {
    console.error('session heartbeat error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
