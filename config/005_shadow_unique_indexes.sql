-- 005_shadow_unique_indexes.sql
-- Enforce uniqueness for instances-per-day per shadow_task

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uniq_shadow_instance_per_day'
  ) THEN
    CREATE UNIQUE INDEX uniq_shadow_instance_per_day
      ON public.shadow_task_instances(shadow_task_id, planned_date_local);
  END IF;
END$$;
