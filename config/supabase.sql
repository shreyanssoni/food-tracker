-- Supabase schema for Nourish
-- Run in Supabase SQL editor

create table if not exists public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  items jsonb not null default '[]'::jsonb,
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  eaten_at timestamptz not null default now(),
  note text null,
  created_at timestamptz not null default now()
);

-- Change user_id to TEXT for NextAuth compatibility
ALTER TABLE public.food_logs 
  ALTER COLUMN user_id TYPE TEXT,
  DROP CONSTRAINT IF EXISTS food_logs_user_fk;

-- Create app_users table (linked to NextAuth)
CREATE TABLE IF NOT EXISTS public.app_users (
  id TEXT PRIMARY KEY,  -- NextAuth user ID
  email TEXT NOT NULL,
  name TEXT,
  image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User preferences (diet, goals, etc.)
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES public.app_users(id) ON DELETE CASCADE,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  daily_calorie_goal INTEGER DEFAULT 2000,
  protein_goal_grams INTEGER DEFAULT 150,
  preferred_cuisines TEXT[] DEFAULT ARRAY['indian']::TEXT[],
  dietary_restrictions TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Extend preferences with profile metrics and macro targets (idempotent)
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS height_cm NUMERIC,
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS age INTEGER,
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male','female','other')),
  ADD COLUMN IF NOT EXISTS activity_level TEXT, -- sedentary|light|moderate|very|super
  ADD COLUMN IF NOT EXISTS goal TEXT, -- maintain|lose|gain
  ADD COLUMN IF NOT EXISTS workout_level TEXT CHECK (workout_level IN ('beginner','intermediate','advanced','pro')),
  ADD COLUMN IF NOT EXISTS fat_goal_grams INTEGER,
  ADD COLUMN IF NOT EXISTS carbs_goal_grams INTEGER;

-- Recreate indexes with TEXT user_id
CREATE INDEX IF NOT EXISTS food_logs_user_time_idx ON public.food_logs(user_id, eaten_at DESC);
CREATE INDEX IF NOT EXISTS food_logs_time_idx ON public.food_logs(eaten_at DESC);

-- Enable RLS and permissive starter policies
ALTER TABLE public.food_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Permissive policies (for dev; tighten later for prod)
CREATE POLICY "Allow read to all" ON public.food_logs
  FOR SELECT USING (true);

CREATE POLICY "Allow insert to all" ON public.food_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow all on app_users" ON public.app_users
  USING (true);

CREATE POLICY "Allow all on user_preferences" ON public.user_preferences
  USING (true);

-- Coach chat messages table (idempotent)
CREATE TABLE IF NOT EXISTS public.coach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  context jsonb DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coach_messages_user_time_idx ON public.coach_messages(user_id, created_at DESC);

ALTER TABLE public.coach_messages ENABLE ROW LEVEL SECURITY;

-- Dev policies (adjust for prod)
CREATE POLICY "Allow read to all on coach_messages" ON public.coach_messages
  FOR SELECT USING (true);

CREATE POLICY "Allow insert to all on coach_messages" ON public.coach_messages
  FOR INSERT WITH CHECK (true);

-- Allow delete in dev so API can clear history
CREATE POLICY "Allow delete to all on coach_messages" ON public.coach_messages
  FOR DELETE USING (true);

-- Running conversation state (summary) per user
CREATE TABLE IF NOT EXISTS public.coach_state (
  user_id TEXT PRIMARY KEY,
  summary TEXT DEFAULT '' ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.coach_state ENABLE ROW LEVEL SECURITY;

-- Dev policies (adjust for prod)
CREATE POLICY "Allow read to all on coach_state" ON public.coach_state
  FOR SELECT USING (true);

CREATE POLICY "Allow upsert to all on coach_state" ON public.coach_state
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update to all on coach_state" ON public.coach_state
  FOR UPDATE USING (true) WITH CHECK (true);

-- Idempotent extensions for structured memory
ALTER TABLE public.coach_state
  ADD COLUMN IF NOT EXISTS prefs_snapshot JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS key_facts JSONB DEFAULT '[]'::jsonb;

-- Allow delete in dev so API can clear state
CREATE POLICY "Allow delete to all on coach_state" ON public.coach_state
  FOR DELETE USING (true);

-- Align user_id types with Supabase auth (UUID) to prevent text=uuid comparison errors
DO $$
BEGIN
  -- coach_messages.user_id to UUID
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'coach_messages' AND column_name = 'user_id' AND data_type <> 'uuid'
  ) THEN
    ALTER TABLE public.coach_messages
      ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
  END IF;

  -- coach_state.user_id to UUID
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'coach_state' AND column_name = 'user_id' AND data_type <> 'uuid'
  ) THEN
    ALTER TABLE public.coach_state
      ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
  END IF;
END $$;
-- Groceries inventory (per-user) -----------------------------
CREATE TABLE IF NOT EXISTS public.groceries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  qty NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'unit',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS groceries_user_time_idx ON public.groceries(user_id, updated_at DESC);

ALTER TABLE public.groceries ENABLE ROW LEVEL SECURITY;

-- Dev policies (adjust/tighten for prod)
CREATE POLICY IF NOT EXISTS "Allow select to all on groceries" ON public.groceries FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Allow insert to all on groceries" ON public.groceries FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Allow update to all on groceries" ON public.groceries FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Allow delete to all on groceries" ON public.groceries FOR DELETE USING (true);

-- For production, you'd replace the above with something like:
-- CREATE POLICY "Users can only see their own data" ON public.user_preferences
--   USING (user_id = auth.uid());
