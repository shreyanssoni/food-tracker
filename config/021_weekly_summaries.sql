-- 021_weekly_summaries.sql
-- Weekly aggregation summaries for Shadow engine

CREATE TABLE IF NOT EXISTS public.weekly_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,
  user_total numeric NOT NULL DEFAULT 0,
  shadow_total numeric NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  carryover numeric NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_summaries_user_week ON public.weekly_summaries(user_id, week_start DESC);

DO $$ BEGIN
  EXECUTE 'ALTER TABLE public.weekly_summaries ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP POLICY IF EXISTS weekly_summaries_all ON public.weekly_summaries;
CREATE POLICY weekly_summaries_all ON public.weekly_summaries
  FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
