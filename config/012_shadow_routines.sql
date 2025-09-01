-- Phase 2A: Shadow routines metadata (per-routine pacing/difficulty)

CREATE TABLE IF NOT EXISTS public.shadow_routines (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  routine_id uuid NOT NULL,
  shadow_speed_target_intra numeric, -- intra-day responsive target
  shadow_speed_target_ema numeric,   -- nightly smoothed target
  difficulty_tier text NOT NULL DEFAULT 'normal' CHECK (difficulty_tier IN ('easy','normal','hard')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (routine_id)
);

-- Add FK to user_routines only if that table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_routines'
  ) THEN
    BEGIN
      ALTER TABLE public.shadow_routines
        ADD CONSTRAINT shadow_routines_routine_id_fkey
        FOREIGN KEY (routine_id) REFERENCES public.user_routines(id) ON DELETE CASCADE;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_shadow_routines_user ON public.shadow_routines(user_id);
CREATE INDEX IF NOT EXISTS idx_shadow_routines_routine ON public.shadow_routines(routine_id);

-- Add a default difficulty on user-level config for fallback
ALTER TABLE public.shadow_config
  ADD COLUMN IF NOT EXISTS default_difficulty_tier text NOT NULL DEFAULT 'normal' CHECK (default_difficulty_tier IN ('easy','normal','hard'));
