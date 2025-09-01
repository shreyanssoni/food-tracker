-- Phase 2A patch: align Shadow tables to app_users (TEXT IDs)

-- 1) shadow_config.user_id: uuid -> text, FK to app_users(id)
DO $$
BEGIN
  -- Drop FK if exists (old reference to public.users)
  BEGIN
    ALTER TABLE public.shadow_config DROP CONSTRAINT IF EXISTS shadow_config_user_id_fkey;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Change type to text if not already
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shadow_config' AND column_name = 'user_id' AND data_type <> 'text'
  ) THEN
    ALTER TABLE public.shadow_config
      ALTER COLUMN user_id TYPE text USING user_id::text;
  END IF;

  -- Recreate FK to public.app_users(id)
  BEGIN
    ALTER TABLE public.shadow_config
      ADD CONSTRAINT shadow_config_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- 2) shadow_dry_run_logs.user_id: uuid -> text, FK to app_users(id)
DO $$
BEGIN
  -- Drop FK if exists (old reference to public.users)
  BEGIN
    ALTER TABLE public.shadow_dry_run_logs DROP CONSTRAINT IF EXISTS shadow_dry_run_logs_user_id_fkey;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Change type to text if not already
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shadow_dry_run_logs' AND column_name = 'user_id' AND data_type <> 'text'
  ) THEN
    ALTER TABLE public.shadow_dry_run_logs
      ALTER COLUMN user_id TYPE text USING user_id::text;
  END IF;

  -- Recreate FK to public.app_users(id)
  BEGIN
    ALTER TABLE public.shadow_dry_run_logs
      ADD CONSTRAINT shadow_dry_run_logs_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;
