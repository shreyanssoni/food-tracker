-- Shadow Engine base config + observability (Phase 0.5)
-- All timestamps UTC. User-local boundaries computed using users.timezone.

-- Create shadow_config with global default support (user_id NULL)
CREATE TABLE IF NOT EXISTS public.shadow_config (
  id uuid PRIMARY KEY,
  user_id uuid UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  base_speed numeric NOT NULL DEFAULT 1.0,
  min_speed numeric NOT NULL DEFAULT 0.25,
  max_speed numeric NOT NULL DEFAULT 5.0,
  adapt_up_factor numeric NOT NULL DEFAULT 1.1,
  adapt_down_factor numeric NOT NULL DEFAULT 0.9,
  smoothing_alpha numeric NOT NULL DEFAULT 0.2,
  recovery_grace_days integer NOT NULL DEFAULT 1,
  carryover_cap numeric NOT NULL DEFAULT 10.0,
  shadow_speed_target numeric,
  enabled_race boolean NOT NULL DEFAULT false,
  ghost_mode_ai boolean NOT NULL DEFAULT true,
  max_notifications_per_day integer NOT NULL DEFAULT 10,
  min_seconds_between_notifications integer NOT NULL DEFAULT 900,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique index to allow a single global row (user_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS ux_shadow_config_global
  ON public.shadow_config((user_id IS NULL)) WHERE user_id IS NULL;

-- Seed a global default config if missing
INSERT INTO public.shadow_config (
  id, user_id, base_speed, min_speed, max_speed, adapt_up_factor, adapt_down_factor,
  smoothing_alpha, recovery_grace_days, carryover_cap, shadow_speed_target,
  enabled_race, ghost_mode_ai, max_notifications_per_day, min_seconds_between_notifications
) VALUES (
  gen_random_uuid(), NULL, 1.0, 0.25, 5.0, 1.1, 0.9,
  0.2, 1, 10.0, 0.2,
  false, true, 10, 900
)
ON CONFLICT ((user_id IS NULL)) WHERE user_id IS NULL DO NOTHING;

-- Observability: dry-run logs table
CREATE TABLE IF NOT EXISTS public.shadow_dry_run_logs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('state_snapshot','race_update','pace_adapt')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shadow_dry_run_user_time
  ON public.shadow_dry_run_logs(user_id, created_at DESC);
