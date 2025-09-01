-- 019_shadow_progress_daily.sql
-- Per-user daily aggregation for Shadow engine (used by state/today & charts)

CREATE TABLE IF NOT EXISTS public.shadow_progress_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  date date NOT NULL,
  user_distance numeric NOT NULL DEFAULT 0,   -- cumulative completions or points
  shadow_distance numeric NOT NULL DEFAULT 0, -- cumulative shadow track
  lead numeric NOT NULL DEFAULT 0,            -- user_distance - shadow_distance
  user_speed_avg numeric,                     -- moving average of user pace
  shadow_speed_target numeric,                -- daily target used
  difficulty_tier text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_spd_user_date ON public.shadow_progress_daily(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_spd_user_created ON public.shadow_progress_daily(user_id, created_at DESC);

-- RLS owner-only
DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.shadow_progress_daily ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

DROP POLICY IF EXISTS spd_all ON public.shadow_progress_daily;
CREATE POLICY spd_all ON public.shadow_progress_daily
  FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
