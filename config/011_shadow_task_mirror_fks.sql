-- Phase 1: Shadow task mirror FKs + cascading deletes
-- Assumes public.shadow_tasks and public.tasks exist.

-- Ensure user_task_id is UNIQUE (mirror must be 1:1)
ALTER TABLE public.shadow_tasks
  ADD CONSTRAINT IF NOT EXISTS ux_shadow_tasks_user_task UNIQUE (user_task_id);

-- Add FK to tasks with ON DELETE CASCADE
ALTER TABLE public.shadow_tasks
  ADD CONSTRAINT IF NOT EXISTS fk_shadow_task_user_task
  FOREIGN KEY (user_task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_shadow_tasks_user_task ON public.shadow_tasks(user_task_id);

-- Create user_id index only if the column exists (for legacy schemas)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shadow_tasks' AND column_name = 'user_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_shadow_tasks_user ON public.shadow_tasks(user_id)';
  END IF;
END $$;
