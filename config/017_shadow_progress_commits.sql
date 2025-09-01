-- Phase 5: Persist decisions + outcomes for Shadow progress
-- Table to store per-user per-day progress decisions and related payloads

CREATE TABLE IF NOT EXISTS public.shadow_progress_commits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  day date NOT NULL, -- user's local day boundary when decision made
  delta numeric NOT NULL, -- completedToday - targetToday
  target_today numeric NOT NULL,
  completed_today numeric NOT NULL,
  decision_kind text NOT NULL CHECK (decision_kind IN ('boost','slowdown','nudge','noop')),
  payload jsonb NOT NULL DEFAULT '{}', -- extra context
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_shadow_progress_commits_user_day
  ON public.shadow_progress_commits(user_id, day);

CREATE INDEX IF NOT EXISTS idx_shadow_progress_commits_user_time
  ON public.shadow_progress_commits(user_id, created_at DESC);

-- Enable RLS and restrict to owner
DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.shadow_progress_commits ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

DROP POLICY IF EXISTS spc_sel ON public.shadow_progress_commits;
DROP POLICY IF EXISTS spc_ins ON public.shadow_progress_commits;
CREATE POLICY spc_sel ON public.shadow_progress_commits
  FOR SELECT USING (user_id = auth.uid()::text);
CREATE POLICY spc_ins ON public.shadow_progress_commits
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);
