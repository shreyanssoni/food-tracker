-- Phase 2A cleanup: remove shadow_routines table per updated direction (tasks are the source of truth)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'shadow_routines'
  ) THEN
    EXECUTE 'DROP TABLE IF EXISTS public.shadow_routines CASCADE';
  END IF;
END $$;
