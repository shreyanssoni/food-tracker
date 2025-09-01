-- 007_migrate_identity_to_app_users.sql
-- Migrate FK references from auth.users(id) to public.app_users(id)
-- and relax RLS policies temporarily to avoid dependency on auth.uid().
-- Idempotent where possible.

-- 1) Update shadow_profile.user_id FK
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage ccu
    WHERE ccu.table_schema = 'public' AND ccu.table_name = 'shadow_profile'
      AND ccu.column_name = 'user_id'
  ) THEN
    -- Drop existing FK if it points to auth.users
    BEGIN
      ALTER TABLE public.shadow_profile
        DROP CONSTRAINT IF EXISTS shadow_profile_user_id_fkey;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Recreate FK to public.app_users(id)
    BEGIN
      ALTER TABLE public.shadow_profile
        ADD CONSTRAINT shadow_profile_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END$$;

-- 2) Update challenges.user_id FK
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'challenges' AND c.column_name = 'user_id'
  ) THEN
    BEGIN
      ALTER TABLE public.challenges
        DROP CONSTRAINT IF EXISTS challenges_user_id_fkey;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    BEGIN
      ALTER TABLE public.challenges
        ADD CONSTRAINT challenges_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END$$;

-- 3) Optional: other tables that previously referenced auth.users
-- Add similar blocks here if needed.

-- 4) RLS policy adjustments
-- Temporarily relax RLS for challenges and dependent tables until we wire policies to app_users-based identity.
DO $$ BEGIN EXECUTE 'ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'ALTER TABLE public.entity_ep_ledger ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'ALTER TABLE public.ai_requests_log ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'ALTER TABLE public.shadow_daily_stats ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Drop existing policies that used auth.uid()
DROP POLICY IF EXISTS challenges_sel ON public.challenges;
DROP POLICY IF EXISTS challenges_mod ON public.challenges;

-- TEMP permissive policies (TO BE REPLACED): allow all for now, app enforces ownership
CREATE POLICY challenges_all ON public.challenges FOR ALL USING (true) WITH CHECK (true);

-- entity_ep_ledger
DROP POLICY IF EXISTS entity_ledger_sel ON public.entity_ep_ledger;
DROP POLICY IF EXISTS entity_ledger_ins ON public.entity_ep_ledger;
CREATE POLICY entity_ledger_all ON public.entity_ep_ledger FOR ALL USING (true) WITH CHECK (true);

-- shadow_daily_stats
DROP POLICY IF EXISTS shadow_daily_stats_sel ON public.shadow_daily_stats;
DROP POLICY IF EXISTS shadow_daily_stats_mod ON public.shadow_daily_stats;
CREATE POLICY shadow_daily_stats_all ON public.shadow_daily_stats FOR ALL USING (true) WITH CHECK (true);

-- ai_requests_log (if it previously used auth.uid())
DROP POLICY IF EXISTS ai_requests_sel ON public.ai_requests_log;
DROP POLICY IF EXISTS ai_requests_mod ON public.ai_requests_log;
CREATE POLICY ai_requests_all ON public.ai_requests_log FOR ALL USING (true) WITH CHECK (true);

-- NOTE: Replace the permissive policies with app_users-based RLS once we finalize the approach
-- (e.g., using request headers or a dedicated JWT claim for app_users.id).
