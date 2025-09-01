-- 001_create_shadow_tables.sql
-- Idempotent creation of Shadow System tables and enums

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'persona_type') THEN
    CREATE TYPE persona_type AS ENUM ('strict', 'playful', 'mentor', 'neutral');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shadow_task_status') THEN
    CREATE TYPE shadow_task_status AS ENUM ('active', 'dropped', 'completed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shadow_instance_status') THEN
    CREATE TYPE shadow_instance_status AS ENUM ('pending', 'in_progress', 'completed', 'missed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alignment_status') THEN
    CREATE TYPE alignment_status AS ENUM ('ahead', 'behind', 'tied', 'shadow_only', 'user_only');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.shadow_profile (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  persona_type  persona_type NOT NULL DEFAULT 'neutral',
  growth_rate   int NOT NULL DEFAULT 1,
  timezone      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS public.shadow_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shadow_id     uuid NOT NULL REFERENCES public.shadow_profile(id) ON DELETE CASCADE,
  task_id       uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  status        shadow_task_status NOT NULL DEFAULT 'active',
  frequency     text,
  byweekday     int[] DEFAULT NULL,
  scheduled_local_time time DEFAULT NULL,
  assigned_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shadow_task_instances (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shadow_task_id     uuid NOT NULL REFERENCES public.shadow_tasks(id) ON DELETE CASCADE,
  planned_start_at   timestamptz NOT NULL,
  planned_end_at     timestamptz NOT NULL,
  planned_date_local date NOT NULL,
  progress           int NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  status             shadow_instance_status NOT NULL DEFAULT 'pending',
  completed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.alignment_log (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shadow_id            uuid NOT NULL REFERENCES public.shadow_profile(id) ON DELETE CASCADE,
  user_completion_id   uuid REFERENCES public.task_completions(id) ON DELETE SET NULL,
  shadow_instance_id   uuid REFERENCES public.shadow_task_instances(id) ON DELETE SET NULL,
  alignment_status     alignment_status NOT NULL,
  recorded_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shadow_profile_user ON public.shadow_profile(user_id);
CREATE INDEX IF NOT EXISTS idx_shadow_tasks_shadow ON public.shadow_tasks(shadow_id);
CREATE INDEX IF NOT EXISTS idx_shadow_tasks_task ON public.shadow_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_shadow_instances_task ON public.shadow_task_instances(shadow_task_id);
CREATE INDEX IF NOT EXISTS idx_shadow_instances_date ON public.shadow_task_instances(planned_date_local);
CREATE INDEX IF NOT EXISTS idx_alignment_log_user_date ON public.alignment_log(user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_alignment_log_shadow_instance ON public.alignment_log(shadow_instance_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS t_shadow_profile_set_updated ON public.shadow_profile;
CREATE TRIGGER t_shadow_profile_set_updated
BEFORE UPDATE ON public.shadow_profile
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
