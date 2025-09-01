-- 020_ai_taunts.sql
-- AI taunts log for Shadow engine

CREATE TABLE IF NOT EXISTS public.ai_taunts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  intensity text NOT NULL CHECK (intensity IN ('low','medium','high')),
  outcome text CHECK (outcome IN ('ignored','motivated','annoyed','converted')),
  message text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_taunts_user_time ON public.ai_taunts(user_id, created_at DESC);

DO $$ BEGIN
  EXECUTE 'ALTER TABLE public.ai_taunts ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP POLICY IF EXISTS ai_taunts_all ON public.ai_taunts;
CREATE POLICY ai_taunts_all ON public.ai_taunts
  FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
