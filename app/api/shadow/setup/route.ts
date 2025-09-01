import { NextResponse } from 'next/server';
import { requireUser } from '@/utils/auth';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

// GET: Fetch current shadow setup status and EP scoreboard
export async function GET() {
  try {
    const user = await requireUser();
    const supabase = createClient();
    const admin = createAdminClient();

    // Ensure shadow_profile exists (idempotent)
    let { data: shadow, error: spErr } = await admin
      .from('shadow_profile')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (spErr && spErr.code !== 'PGRST116') {
      // PGRST116: No rows found for maybeSingle
      return NextResponse.json({ error: spErr.message }, { status: 500 });
    }

    if (!shadow) {
      const { data: inserted, error: insErr } = await admin
        .from('shadow_profile')
        .insert({ user_id: user.id })
        .select('*')
        .single();
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
      shadow = inserted;
    }

    // Fetch user + shadow EPs
    const [{ data: appUser, error: appUserErr }] = await Promise.all([
      supabase.from('app_users').select('id, user_ep').eq('id', user.id).single(),
    ]);
    if (appUserErr) return NextResponse.json({ error: appUserErr.message }, { status: 500 });

    return NextResponse.json({
      activated: !!shadow.activated_at,
      preferences: shadow.preferences || null,
      user_ep: appUser.user_ep ?? 0,
      shadow_ep: shadow.shadow_ep ?? 0,
      shadow_profile_id: shadow.id,
    });
  } catch (e: any) {
    const isAuth = e?.name === 'AuthenticationError';
    const status = isAuth ? 401 : 500;
    return NextResponse.json({
      error: isAuth ? 'Unauthorized' : 'Internal Server Error',
      message: e?.message ?? null,
      stack: e?.stack ?? null,
      name: e?.name ?? null,
    }, { status });
  }
}

// POST: Save preferences and activate shadow profile
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const { preferences } = body as { preferences?: any };

    const supabase = createClient();
    const admin = createAdminClient();

    // Upsert-like behavior: ensure row exists first
    let { data: shadow, error: spErr } = await admin
      .from('shadow_profile')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (spErr && spErr.code !== 'PGRST116') {
      return NextResponse.json({ error: spErr.message }, { status: 500 });
    }

    if (!shadow) {
      const { data: inserted, error: insErr } = await admin
        .from('shadow_profile')
        .insert({ user_id: user.id })
        .select('*')
        .single();
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
      shadow = inserted;
    }

    const { data: updated, error: updErr } = await admin
      .from('shadow_profile')
      .update({
        preferences: preferences ?? shadow.preferences ?? {},
        activated_at: shadow.activated_at ?? new Date().toISOString(),
      })
      .eq('id', shadow.id)
      .select('*')
      .single();

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    // Fire-and-forget: trigger daily challenge generation right after activation
    try {
      if (!shadow.activated_at) {
        const base = process.env.PUBLIC_BASE_URL || (() => { try { return new URL((req as any).url).origin; } catch { return ''; } })();
        const secret = process.env.CRON_SECRET;
        if (base && secret) {
          // Use admin-secret endpoint; idempotent and device-agnostic
          fetch(`${base}/api/shadow/cron/generate-daily-admin?secret=${encodeURIComponent(secret)}`, { method: 'GET' }).catch(() => {});
        }
      }
    } catch {}

    return NextResponse.json({
      ok: true,
      shadow_profile_id: updated.id,
      activated: !!updated.activated_at,
      preferences: updated.preferences || null,
    });
  } catch (e: any) {
    const isAuth = e?.name === 'AuthenticationError';
    const status = isAuth ? 401 : 500;
    return NextResponse.json({
      error: isAuth ? 'Unauthorized' : 'Internal Server Error',
      message: e?.message ?? null,
      stack: e?.stack ?? null,
      name: e?.name ?? null,
    }, { status });
  }
}
