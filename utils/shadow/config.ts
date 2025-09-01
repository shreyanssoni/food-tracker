import { createClient } from '@/utils/supabase/server';

export type ShadowConfig = {
  base_speed: number;
  min_speed: number;
  max_speed: number;
  adapt_up_factor: number;
  adapt_down_factor: number;
  smoothing_alpha: number;
  recovery_grace_days: number;
  carryover_cap: number;
  shadow_speed_target: number | null;
  enabled_race: boolean;
  ghost_mode_ai: boolean;
  max_notifications_per_day: number;
  min_seconds_between_notifications: number;
};

export async function getShadowConfig(userId?: string): Promise<ShadowConfig> {
  const supabase = createClient();
  const defaults: ShadowConfig = {
    base_speed: 3,
    min_speed: 1,
    max_speed: 10,
    adapt_up_factor: 1.2,
    adapt_down_factor: 0.85,
    smoothing_alpha: 0.25,
    recovery_grace_days: 1,
    carryover_cap: 10,
    shadow_speed_target: null,
    enabled_race: true,
    ghost_mode_ai: false,
    max_notifications_per_day: 10,
    min_seconds_between_notifications: 900,
  };
  // Prefer user-specific row; fallback to global (user_id is null)
  let { data, error } = await supabase
    .from('shadow_config')
    .select('*')
    .or(`user_id.eq.${userId || '00000000-0000-0000-0000-000000000000'},user_id.is.null`)
    .order('user_id', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    // Try to seed a global defaults row; ignore errors (RLS/constraints)
    try {
      await supabase.from('shadow_config').insert({
        // user_id null makes it a global default row
        user_id: null as any,
        ...defaults,
      } as any);
    } catch (_) {}
    // Re-read after attempted seed
    const retry = await supabase
      .from('shadow_config')
      .select('*')
      .or(`user_id.eq.${userId || '00000000-0000-0000-0000-000000000000'},user_id.is.null`)
      .order('user_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    data = retry.data || null;
  }
  if (!data) {
    // As a last resort, return in-memory defaults to keep UI/cron working
    return defaults;
  }
  return {
    base_speed: Number(data.base_speed),
    min_speed: Number(data.min_speed),
    max_speed: Number(data.max_speed),
    adapt_up_factor: Number(data.adapt_up_factor),
    adapt_down_factor: Number(data.adapt_down_factor),
    smoothing_alpha: Number(data.smoothing_alpha),
    recovery_grace_days: Number(data.recovery_grace_days),
    carryover_cap: Number(data.carryover_cap),
    shadow_speed_target: data.shadow_speed_target == null ? null : Number(data.shadow_speed_target),
    enabled_race: !!data.enabled_race,
    ghost_mode_ai: !!data.ghost_mode_ai,
    max_notifications_per_day: Number(data.max_notifications_per_day),
    min_seconds_between_notifications: Number(data.min_seconds_between_notifications),
  };
}

export type DryRunKind = 'state_snapshot' | 'race_update' | 'pace_adapt';

export async function logDryRun(userId: string, kind: DryRunKind, payload: any) {
  const supabase = createClient();
  await supabase.from('shadow_dry_run_logs').insert({
    user_id: userId as any,
    kind,
    payload,
  } as any);
}
