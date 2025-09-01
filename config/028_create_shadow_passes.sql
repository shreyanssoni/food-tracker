-- 028_create_shadow_passes.sql
-- Records when the Shadow "passes" (auto-completes) a task on a given local day.
-- Ensures at most one record per (user_id, task_id, date).

CREATE TABLE IF NOT EXISTS public.shadow_passes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id      uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  date         date NOT NULL,
  expected_at  timestamptz, -- optional: approximate expected time in user's tz (cron execution time if tz not available)
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, task_id, date)
);

CREATE INDEX IF NOT EXISTS idx_shadow_passes_user_date ON public.shadow_passes(user_id, date DESC);
