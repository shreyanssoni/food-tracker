-- 030_task_completions_rls.sql
-- RLS and policies for public.task_completions
-- Users can access only their own rows. Service role has full access.

-- Enable RLS
ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_completions FORCE ROW LEVEL SECURITY;

-- Select own rows
DO $$ BEGIN
  CREATE POLICY select_own_task_completions
  ON public.task_completions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Insert own rows
DO $$ BEGIN
  CREATE POLICY insert_own_task_completions
  ON public.task_completions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Update own rows
DO $$ BEGIN
  CREATE POLICY update_own_task_completions
  ON public.task_completions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Delete own rows
DO $$ BEGIN
  CREATE POLICY delete_own_task_completions
  ON public.task_completions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Service role full access (used by backend jobs)
DO $$ BEGIN
  CREATE POLICY service_task_completions_all
  ON public.task_completions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
