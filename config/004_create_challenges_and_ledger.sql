-- 004_create_challenges_and_ledger.sql
-- New core tables for Challenges, EP ledger, AI logs, and Shadow daily stats (idempotent, non-breaking)

-- Enums (create if missing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entity_type') THEN
    CREATE TYPE entity_type AS ENUM ('user', 'shadow');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_source') THEN
    CREATE TYPE ledger_source AS ENUM ('task', 'challenge', 'bonus', 'streak');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'challenge_state') THEN
    CREATE TYPE challenge_state AS ENUM ('offered', 'accepted', 'declined', 'expired', 'completed_win', 'completed_loss');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'win_condition_type') THEN
    CREATE TYPE win_condition_type AS ENUM ('before_time', 'before_shadow', 'within_window', 'count_more_than_shadow');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ai_provider') THEN
    CREATE TYPE ai_provider AS ENUM ('gemini', 'openrouter');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_priority') THEN
    CREATE TYPE notification_priority AS ENUM ('modal', 'banner', 'silent');
  END IF;
END$$;

-- Challenges
CREATE TABLE IF NOT EXISTS public.challenges (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shadow_profile_id   uuid NOT NULL REFERENCES public.shadow_profile(id) ON DELETE CASCADE,
  state               challenge_state NOT NULL DEFAULT 'offered',
  win_condition_type  win_condition_type NOT NULL,
  base_ep             int NOT NULL DEFAULT 10,
  reward_multiplier   int NOT NULL DEFAULT 1,
  generated_by        text NOT NULL DEFAULT 'rule', -- 'ai' | 'rule'
  ai_request_id       uuid,
  start_time          timestamptz,
  due_time            timestamptz,
  task_template       jsonb NOT NULL DEFAULT '{}'::jsonb,
  linked_user_task_id   uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  linked_shadow_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- EP ledger unified for user & shadow
CREATE TABLE IF NOT EXISTS public.entity_ep_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   entity_type NOT NULL,
  entity_id     uuid NOT NULL,
  source        ledger_source NOT NULL,
  amount        int NOT NULL,
  task_id       uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  challenge_id  uuid REFERENCES public.challenges(id) ON DELETE SET NULL,
  meta          jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- AI requests log
CREATE TABLE IF NOT EXISTS public.ai_requests_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider      ai_provider NOT NULL,
  model         text,
  prompt_ref    text,
  prompt        text,
  response_ref  text,
  status        text,
  tokens_meta   jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Shadow daily stats (cached aggregates)
CREATE TABLE IF NOT EXISTS public.shadow_daily_stats (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shadow_profile_id   uuid NOT NULL REFERENCES public.shadow_profile(id) ON DELETE CASCADE,
  date                date NOT NULL,
  ep_total            int NOT NULL DEFAULT 0,
  wins                int NOT NULL DEFAULT 0,
  losses              int NOT NULL DEFAULT 0,
  align_pct           int NOT NULL DEFAULT 0 CHECK (align_pct >= 0 AND align_pct <= 100),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shadow_profile_id, date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_entity_ep_ledger_entity ON public.entity_ep_ledger(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_challenges_user_state_due ON public.challenges(user_id, state, due_time);
CREATE INDEX IF NOT EXISTS idx_challenges_shadow_state ON public.challenges(shadow_profile_id, state);
CREATE INDEX IF NOT EXISTS idx_ai_requests_user_created ON public.ai_requests_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shadow_daily_stats_shadow_date ON public.shadow_daily_stats(shadow_profile_id, date);

-- updated_at trigger for challenges
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS t_challenges_set_updated ON public.challenges;
CREATE TRIGGER t_challenges_set_updated
BEFORE UPDATE ON public.challenges
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
