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

    // Auto-seed per-user shadow_config based on difficulty
    try {
      const diff: string = String((preferences?.difficulty ?? updated.preferences?.difficulty ?? 'medium') as string).toLowerCase();
      // Tuned presets per difficulty
      const presets: Record<string, any> = {
        easy: {
          base_speed: 2,
          min_speed: 1,
          max_speed: 6,
          adapt_up_factor: 1.1,
          adapt_down_factor: 0.9,
          smoothing_alpha: 0.3,
          recovery_grace_days: 2,
          carryover_cap: 5,
          enabled_race: true,
          ghost_mode_ai: false,
          max_notifications_per_day: 8,
          min_seconds_between_notifications: 1200,
        },
        medium: {
          base_speed: 3,
          min_speed: 1,
          max_speed: 10,
          adapt_up_factor: 1.2,
          adapt_down_factor: 0.85,
          smoothing_alpha: 0.25,
          recovery_grace_days: 1,
          carryover_cap: 10,
          enabled_race: true,
          ghost_mode_ai: false,
          max_notifications_per_day: 10,
          min_seconds_between_notifications: 900,
        },
        hard: {
          base_speed: 4,
          min_speed: 2,
          max_speed: 12,
          adapt_up_factor: 1.35,
          adapt_down_factor: 0.8,
          smoothing_alpha: 0.2,
          recovery_grace_days: 0,
          carryover_cap: 15,
          enabled_race: true,
          ghost_mode_ai: true,
          max_notifications_per_day: 12,
          min_seconds_between_notifications: 600,
        },
      };
      const cfg = presets[diff] || presets.medium;

      await admin
        .from('shadow_config')
        .upsert(
          {
            user_id: user.id,
            ...cfg,
            shadow_speed_target: cfg.base_speed,
          } as any,
          { onConflict: 'user_id' }
        );
    } catch (e) {
      // non-fatal
      console.error('auto-seed shadow_config failed', e);
    }

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
