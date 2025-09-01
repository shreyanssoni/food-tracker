-- 005_alter_tasks_notifications_alignment.sql
-- Extend tasks + notifications; augment alignment_log (idempotent, non-breaking)

-- Enums for tasks
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'owner_type') THEN
    CREATE TYPE owner_type AS ENUM ('user', 'shadow');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_origin') THEN
    CREATE TYPE task_origin AS ENUM ('user', 'shadow', 'ai_shadow', 'system');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_category') THEN
    CREATE TYPE task_category AS ENUM ('normal', 'challenge');
  END IF;
END$$;

-- tasks table alterations (additive, nullable/safe defaults)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS owner_type owner_type DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS owner_id uuid,
  ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin task_origin DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS category task_category DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS challenge_id uuid REFERENCES public.challenges(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS streak_eligible boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS timezone text;

-- Helpful index (does not assume start_time exists)
CREATE INDEX IF NOT EXISTS idx_tasks_owner ON public.tasks(owner_type, owner_id);

-- notifications: extend channel enum and add priority + deep_link
DO $$
BEGIN
  BEGIN
    ALTER TYPE notification_channel ADD VALUE IF NOT EXISTS 'challenge';
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END$$;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS priority notification_priority DEFAULT 'banner',
  ADD COLUMN IF NOT EXISTS deep_link text;

-- alignment_log: add optional task linkage + scoring fields
ALTER TABLE public.alignment_log
  ADD COLUMN IF NOT EXISTS user_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shadow_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS time_diff_seconds int,
  ADD COLUMN IF NOT EXISTS score_delta int;
