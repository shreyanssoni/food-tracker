-- Align fcm_tokens.user_id with NextAuth (TEXT) and remove FK to auth.users
-- Idempotent migration: safe to re-run

-- Drop FK if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY'
      AND table_schema = 'public'
      AND table_name = 'fcm_tokens'
      AND constraint_name = 'fcm_tokens_user_id_fkey'
  ) THEN
    ALTER TABLE public.fcm_tokens DROP CONSTRAINT fcm_tokens_user_id_fkey;
  END IF;
END $$;

-- Alter column type to TEXT if currently UUID
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fcm_tokens' AND column_name = 'user_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.fcm_tokens
      ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
  END IF;
END $$;

-- Ensure RLS is enabled
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Recreate owner-read policy with proper casting (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fcm_tokens' AND policyname = 'Users can view their tokens'
  ) THEN
    DROP POLICY "Users can view their tokens" ON public.fcm_tokens;
  END IF;
  CREATE POLICY "Users can view their tokens" ON public.fcm_tokens FOR SELECT USING (auth.uid()::text = user_id);
END $$;
