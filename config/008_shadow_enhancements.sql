-- 008_shadow_enhancements.sql
-- Shadow System Enhancements: DB schema changes (idempotent)
-- - Extend shadow_profile with preferences, activated_at, shadow_ep
-- - Extend app_users with user_ep
-- - Create shadow_challenges table (separate from existing challenges)

-- 1) Ensure required extensions
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 2) Extend shadow_profile
ALTER TABLE public.shadow_profile
  ADD COLUMN IF NOT EXISTS preferences jsonb,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS shadow_ep integer DEFAULT 0;

-- 3) Extend app_users
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS user_ep integer DEFAULT 0;

-- 4) Create enums (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shadow_challenge_status') THEN
    CREATE TYPE shadow_challenge_status AS ENUM ('pending', 'won', 'lost');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'winner_type') THEN
    CREATE TYPE winner_type AS ENUM ('user', 'shadow');
  END IF;
END$$;

-- 5) Create shadow_challenges table
CREATE TABLE IF NOT EXISTS public.shadow_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  shadow_profile_id uuid NOT NULL REFERENCES public.shadow_profile(id) ON DELETE CASCADE,
  challenge_text text NOT NULL,
  deadline timestamptz NOT NULL,
  status shadow_challenge_status NOT NULL DEFAULT 'pending',
  winner winner_type,
  ep_awarded integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_shadow_challenges_user ON public.shadow_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_shadow_challenges_status ON public.shadow_challenges(status);
CREATE INDEX IF NOT EXISTS idx_shadow_challenges_deadline ON public.shadow_challenges(deadline);

-- One pending challenge per day per user (by deadline date)
CREATE UNIQUE INDEX IF NOT EXISTS idx_shadow_challenges_unique_pending_day
  ON public.shadow_challenges (user_id, (deadline::date))
  WHERE status = 'pending';

-- 6) RLS
DO $$ BEGIN EXECUTE 'ALTER TABLE public.shadow_challenges ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Tight RLS: only owning user can access their rows
DROP POLICY IF EXISTS shadow_challenges_all ON public.shadow_challenges;
DROP POLICY IF EXISTS shadow_challenges_select ON public.shadow_challenges;
DROP POLICY IF EXISTS shadow_challenges_insert ON public.shadow_challenges;
DROP POLICY IF EXISTS shadow_challenges_update ON public.shadow_challenges;
DROP POLICY IF EXISTS shadow_challenges_delete ON public.shadow_challenges;

CREATE POLICY shadow_challenges_select ON public.shadow_challenges
  FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY shadow_challenges_insert ON public.shadow_challenges
  FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY shadow_challenges_update ON public.shadow_challenges
  FOR UPDATE
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY shadow_challenges_delete ON public.shadow_challenges
  FOR DELETE
  USING (user_id = auth.uid()::text);

-- 7) Views or helper materialized views can be added later as needed

-- 8) Ensure shadow_profile.user_id is text and FK to app_users(id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shadow_profile' AND column_name = 'user_id' AND data_type <> 'text'
  ) THEN
    ALTER TABLE public.shadow_profile ALTER COLUMN user_id TYPE text USING user_id::text;
  END IF;
  -- Recreate FK
  BEGIN
    ALTER TABLE public.shadow_profile DROP CONSTRAINT IF EXISTS shadow_profile_user_id_fkey;
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
  BEGIN
    ALTER TABLE public.shadow_profile
      ADD CONSTRAINT shadow_profile_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END$$;

-- 9) RPCs to increment EPs (idempotent definitions)
CREATE OR REPLACE FUNCTION public.increment_shadow_ep(p_shadow_profile_id uuid, p_delta integer)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.shadow_profile
    SET shadow_ep = COALESCE(shadow_ep, 0) + COALESCE(p_delta, 0)
  WHERE id = p_shadow_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_user_ep(p_user_id text, p_delta integer)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.app_users
    SET user_ep = COALESCE(user_ep, 0) + COALESCE(p_delta, 0)
  WHERE id = p_user_id;
END;
$$;
