-- Gamification schema additions (idempotent)
-- Run after config/supabase.sql

-- Tasks catalog (user-created and system/unlocked by level)
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,                         -- owner; for system defaults use 'system'
  title TEXT NOT NULL,
  description TEXT,
  ep_value INTEGER NOT NULL DEFAULT 10,          -- EP awarded on completion
  is_system BOOLEAN NOT NULL DEFAULT FALSE,      -- true for pre-defined tasks
  min_level INTEGER NOT NULL DEFAULT 1,          -- unlock level for system tasks
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_user_active_idx ON public.tasks(user_id, active);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow select to all on tasks" ON public.tasks FOR SELECT USING (true);
CREATE POLICY "Allow insert to all on tasks" ON public.tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to all on tasks" ON public.tasks FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete to all on tasks" ON public.tasks FOR DELETE USING (true);

-- Task schedule: frequency and custom rules
-- frequency: daily|weekly|custom
-- For weekly: use byweekday as array of 0-6 (Sun=0)
-- For custom: use byweekday + at_time (e.g., '07:30:00') and optional timezone
CREATE TABLE IF NOT EXISTS public.task_schedules (
  task_id uuid PRIMARY KEY REFERENCES public.tasks(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily','weekly','custom')),
  byweekday SMALLINT[] DEFAULT NULL,             -- 0..6
  at_time TIME DEFAULT NULL,                     -- time of day
  timezone TEXT DEFAULT 'UTC',
  start_date DATE DEFAULT (CURRENT_DATE),
  end_date DATE DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.task_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow select to all on task_schedules" ON public.task_schedules FOR SELECT USING (true);
CREATE POLICY "Allow insert to all on task_schedules" ON public.task_schedules FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to all on task_schedules" ON public.task_schedules FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete to all on task_schedules" ON public.task_schedules FOR DELETE USING (true);

-- Completions of tasks
CREATE TABLE IF NOT EXISTS public.task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_on DATE NOT NULL DEFAULT (CURRENT_DATE),
  ep_awarded INTEGER NOT NULL,
  notes TEXT
);

-- One completion per task per day per user (UTC date as stored)
CREATE UNIQUE INDEX IF NOT EXISTS task_completions_uniq_daily
  ON public.task_completions(user_id, task_id, completed_on);

CREATE INDEX IF NOT EXISTS task_completions_user_time_idx ON public.task_completions(user_id, completed_at DESC);
ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow select to all on task_completions" ON public.task_completions FOR SELECT USING (true);
CREATE POLICY "Allow insert to all on task_completions" ON public.task_completions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow delete to all on task_completions" ON public.task_completions FOR DELETE USING (true);

-- EP ledger: records all EP changes
CREATE TABLE IF NOT EXISTS public.ep_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,                           -- e.g., 'task', 'bonus', 'adjustment'
  source_id uuid,                                  -- references to related entities when applicable
  delta_ep INTEGER NOT NULL,                       -- positive or negative
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ep_ledger_user_time_idx ON public.ep_ledger(user_id, created_at DESC);
ALTER TABLE public.ep_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow select to all on ep_ledger" ON public.ep_ledger FOR SELECT USING (true);
CREATE POLICY "Allow insert to all on ep_ledger" ON public.ep_ledger FOR INSERT WITH CHECK (true);

-- User progress: current level and EP within level
CREATE TABLE IF NOT EXISTS public.user_progress (
  user_id TEXT PRIMARY KEY,
  level INTEGER NOT NULL DEFAULT 1,
  ep_in_level INTEGER NOT NULL DEFAULT 0,         -- EP accumulated toward next level
  total_ep BIGINT NOT NULL DEFAULT 0,             -- lifetime EP
  diamonds INTEGER NOT NULL DEFAULT 0,            -- soft currency balance
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow select to all on user_progress" ON public.user_progress FOR SELECT USING (true);
CREATE POLICY "Allow upsert to all on user_progress" ON public.user_progress FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to all on user_progress" ON public.user_progress FOR UPDATE USING (true) WITH CHECK (true);

-- Levels catalog: EP requirements per level
CREATE TABLE IF NOT EXISTS public.levels (
  level INTEGER PRIMARY KEY,
  ep_required INTEGER NOT NULL                     -- EP needed to go from level->level+1
);

ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read to all on levels" ON public.levels FOR SELECT USING (true);
CREATE POLICY "Allow insert to all on levels" ON public.levels FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to all on levels" ON public.levels FOR UPDATE USING (true) WITH CHECK (true);

-- Track default level-up diamond claims to prevent re-claiming for the same level
CREATE TABLE IF NOT EXISTS public.user_level_claims (
  user_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, level)
);

ALTER TABLE public.user_level_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read to all on user_level_claims" ON public.user_level_claims FOR SELECT USING (true);
CREATE POLICY "Allow insert to all on user_level_claims" ON public.user_level_claims FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to all on user_level_claims" ON public.user_level_claims FOR UPDATE USING (true) WITH CHECK (true);

-- Rewards catalog (diamonds or collectibles unlocks)
CREATE TABLE IF NOT EXISTS public.rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('diamond','collectible')),
  amount INTEGER DEFAULT 0,                        -- diamonds amount if kind='diamond'
  collectible_id uuid,                             -- reference to collectibles when kind='collectible'
  unlock_level INTEGER NOT NULL                    -- level at which reward is granted
);

ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read to all on rewards" ON public.rewards FOR SELECT USING (true);
CREATE POLICY "Allow insert to all on rewards" ON public.rewards FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to all on rewards" ON public.rewards FOR UPDATE USING (true) WITH CHECK (true);

-- =============================
-- Group rewards per unlock rule/threshold to have a single record per level/EP threshold
-- =============================

-- Group table: one row per unlock condition (either by level or total_ep)
CREATE TABLE IF NOT EXISTS public.level_reward_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unlock_rule TEXT NOT NULL CHECK (unlock_rule IN ('level','total_ep')),
  unlock_level INTEGER,
  unlock_ep BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(unlock_rule, unlock_level, unlock_ep)
);

ALTER TABLE public.level_reward_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read to all on level_reward_groups" ON public.level_reward_groups FOR SELECT USING (true);
CREATE POLICY "Allow insert to all on level_reward_groups" ON public.level_reward_groups FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to all on level_reward_groups" ON public.level_reward_groups FOR UPDATE USING (true) WITH CHECK (true);

-- Add a generated unique key to avoid NULL conflicts in composite unique constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='level_reward_groups' AND column_name='group_key'
  ) THEN
    ALTER TABLE public.level_reward_groups
      ADD COLUMN group_key TEXT GENERATED ALWAYS AS (
        CASE
          WHEN unlock_rule = 'level' THEN 'level:' || COALESCE(unlock_level, -1)::text
          ELSE 'total_ep:' || COALESCE(unlock_ep, -1)::text
        END
      ) STORED;
  END IF;
  -- Create unique index on group_key
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='level_reward_groups_group_key_uniq'
  ) THEN
    CREATE UNIQUE INDEX level_reward_groups_group_key_uniq ON public.level_reward_groups(group_key);
  END IF;
END $$;

-- Link existing rewards to a group
DO $$
BEGIN
  -- Add group_id column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rewards' AND column_name = 'group_id'
  ) THEN
    ALTER TABLE public.rewards ADD COLUMN group_id uuid NULL REFERENCES public.level_reward_groups(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Backfill groups and set group_id on rewards (idempotent)
DO $$
DECLARE
  _r RECORD;
  _gid uuid;
BEGIN
  -- Ensure groups exist for each distinct unlock condition in rewards
  INSERT INTO public.level_reward_groups (unlock_rule, unlock_level, unlock_ep)
  SELECT DISTINCT
    COALESCE(unlock_rule, 'level') AS unlock_rule,
    CASE WHEN COALESCE(unlock_rule, 'level') = 'level' THEN unlock_level ELSE NULL END AS unlock_level,
    CASE WHEN COALESCE(unlock_rule, 'level') = 'total_ep' THEN unlock_ep ELSE NULL END AS unlock_ep
  FROM public.rewards r
  ON CONFLICT (unlock_rule, unlock_level, unlock_ep) DO NOTHING;

  -- Assign group_id for rewards missing it
  FOR _r IN
    SELECT id, COALESCE(unlock_rule, 'level') AS unlock_rule, unlock_level, unlock_ep
    FROM public.rewards
    WHERE group_id IS NULL
  LOOP
    SELECT id INTO _gid FROM public.level_reward_groups g
    WHERE g.unlock_rule = _r.unlock_rule
      AND (
        (_r.unlock_rule = 'level' AND g.unlock_level = _r.unlock_level)
        OR (_r.unlock_rule = 'total_ep' AND g.unlock_ep = _r.unlock_ep)
      )
    LIMIT 1;
    IF _gid IS NOT NULL THEN
      UPDATE public.rewards SET group_id = _gid WHERE id = _r.id;
    END IF;
  END LOOP;
END $$;

-- Collectibles catalog
CREATE TABLE IF NOT EXISTS public.collectibles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon TEXT,                                       -- SVG or asset path
  rarity TEXT CHECK (rarity IN ('common','rare','epic','legendary')) DEFAULT 'common',
  -- Private/user-specific collectibles for goals
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  owner_user_id TEXT DEFAULT NULL
);

-- Ensure new columns exist if table already created previously
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='collectibles') THEN
    BEGIN
      ALTER TABLE public.collectibles ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE public.collectibles ADD COLUMN IF NOT EXISTS owner_user_id TEXT DEFAULT NULL;
    EXCEPTION WHEN duplicate_column THEN
      -- ignore
      NULL;
    END;
  END IF;
END $$;

ALTER TABLE public.collectibles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read to all on collectibles" ON public.collectibles FOR SELECT USING (true);
CREATE POLICY "Allow insert to all on collectibles" ON public.collectibles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to all on collectibles" ON public.collectibles FOR UPDATE USING (true) WITH CHECK (true);

-- Extend collectibles with lore/story and public slug for deep links (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='collectibles') THEN
    BEGIN
      ALTER TABLE public.collectibles ADD COLUMN IF NOT EXISTS public_slug TEXT;
      ALTER TABLE public.collectibles ADD COLUMN IF NOT EXISTS lore TEXT;              -- short lore snippet
      ALTER TABLE public.collectibles ADD COLUMN IF NOT EXISTS story_title TEXT;       -- heading for the story
      ALTER TABLE public.collectibles ADD COLUMN IF NOT EXISTS story_md TEXT;          -- rich text/markdown story
      ALTER TABLE public.collectibles ADD COLUMN IF NOT EXISTS og_image_url TEXT;      -- optional share image template
    EXCEPTION WHEN duplicate_column THEN
      NULL;
    END;
    -- Unique index on slug
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='collectibles_public_slug_uniq'
    ) THEN
      CREATE UNIQUE INDEX collectibles_public_slug_uniq ON public.collectibles(public_slug);
    END IF;
  END IF;
END $$;

-- Ownership of collectibles by users
CREATE TABLE IF NOT EXISTS public.user_collectibles (
  user_id TEXT NOT NULL,
  collectible_id uuid NOT NULL REFERENCES public.collectibles(id) ON DELETE CASCADE,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, collectible_id)
);

ALTER TABLE public.user_collectibles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read to all on user_collectibles" ON public.user_collectibles FOR SELECT USING (true);
CREATE POLICY "Allow insert to all on user_collectibles" ON public.user_collectibles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow delete to all on user_collectibles" ON public.user_collectibles FOR DELETE USING (true);

-- Add sharing metadata on ownership (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_collectibles') THEN
    BEGIN
      ALTER TABLE public.user_collectibles ADD COLUMN IF NOT EXISTS awarded_to_name TEXT;
      ALTER TABLE public.user_collectibles ADD COLUMN IF NOT EXISTS share_image_url TEXT;
    EXCEPTION WHEN duplicate_column THEN
      NULL;
    END;
  END IF;
END $$;

-- Track how a collectible was obtained (idempotent)
ALTER TABLE public.user_collectibles
  ADD COLUMN IF NOT EXISTS source TEXT CHECK (source IN ('purchase','reward','admin_grant'));

-- Collectibles store catalog (items purchasable with diamonds)
CREATE TABLE IF NOT EXISTS public.collectibles_store (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collectible_id uuid NOT NULL UNIQUE REFERENCES public.collectibles(id) ON DELETE CASCADE,
  price INTEGER NOT NULL CHECK (price >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.collectibles_store ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read to all on collectibles_store" ON public.collectibles_store FOR SELECT USING (true);
CREATE POLICY "Allow insert to all on collectibles_store" ON public.collectibles_store FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to all on collectibles_store" ON public.collectibles_store FOR UPDATE USING (true) WITH CHECK (true);

-- Focused in-app notifications
CREATE TABLE IF NOT EXISTS public.user_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT DEFAULT NULL,                         -- optional deep link within app
  read_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read own messages" ON public.user_messages FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Allow insert own messages" ON public.user_messages FOR INSERT WITH CHECK (auth.uid()::text = user_id);
-- Allow service/admin to insert for any user (bypass via service key or privileged RLS as used elsewhere)

-- Diamonds ledger (transactional record of diamond changes)
CREATE TABLE IF NOT EXISTS public.diamond_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  delta INTEGER NOT NULL,                           -- positive or negative
  reason TEXT NOT NULL,                             -- e.g., 'level_up','reward','purchase','spend'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS diamond_ledger_user_time_idx ON public.diamond_ledger(user_id, created_at DESC);
ALTER TABLE public.diamond_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read to all on diamond_ledger" ON public.diamond_ledger FOR SELECT USING (true);
CREATE POLICY "Allow insert to all on diamond_ledger" ON public.diamond_ledger FOR INSERT WITH CHECK (true);

-- Helper view: today due tasks (simplified; can be refined per timezone)
CREATE OR REPLACE VIEW public.v_today_tasks AS
SELECT
  t.id as task_id,
  t.user_id,
  t.title,
  t.ep_value,
  s.frequency,
  s.byweekday,
  s.at_time,
  (CURRENT_DATE) as due_date
FROM public.tasks t
JOIN public.task_schedules s ON s.task_id = t.id
WHERE t.active = TRUE;

-- =============================
-- Additions: centralized unlock rules and claims
-- =============================

-- Rewards: support EP-based unlocks in addition to level-based
ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS unlock_rule TEXT
    CHECK (unlock_rule IN ('level','total_ep')) DEFAULT 'level',
  ADD COLUMN IF NOT EXISTS unlock_ep BIGINT;

-- Guard: ensure the correct parameter is provided based on rule
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rewards_unlock_rule_guard'
      AND conrelid = 'public.rewards'::regclass
  ) THEN
    ALTER TABLE public.rewards
      ADD CONSTRAINT rewards_unlock_rule_guard CHECK (
        (unlock_rule = 'level' AND unlock_level IS NOT NULL) OR
        (unlock_rule = 'total_ep' AND unlock_ep IS NOT NULL)
      );
  END IF;
END $$;

-- =============================
-- Goals and Streaks
-- =============================

-- Goals table
CREATE TABLE IF NOT EXISTS public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  deadline DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','failed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read to all on goals" ON public.goals FOR SELECT USING (true);
CREATE POLICY "Allow insert to all on goals" ON public.goals FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to all on goals" ON public.goals FOR UPDATE USING (true) WITH CHECK (true);
-- Allow owners to delete their own goals
CREATE POLICY "Allow delete to all on goals" ON public.goals FOR DELETE USING (true);

-- Goal task templates (define streak rules per goal)
-- frequency: daily | weekly | custom
CREATE TABLE IF NOT EXISTS public.goal_task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  ep_value INTEGER NOT NULL DEFAULT 10,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily','weekly','custom')),
  times_per_period INTEGER NOT NULL DEFAULT 1,
  byweekday SMALLINT[] DEFAULT NULL,              -- for weekly/custom; 0..6
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.goal_task_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read to all on goal_task_templates" ON public.goal_task_templates FOR SELECT USING (true);
CREATE POLICY "Allow insert to all on goal_task_templates" ON public.goal_task_templates FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to all on goal_task_templates" ON public.goal_task_templates FOR UPDATE USING (true) WITH CHECK (true);
-- Allow owner (via goal) to delete templates
CREATE POLICY "Allow delete to all on goal_task_templates" ON public.goal_task_templates FOR DELETE USING (true);

-- Link created per-user tasks to goal templates (when materialized for the user)
CREATE TABLE IF NOT EXISTS public.goal_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.goal_task_templates(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE
);

ALTER TABLE public.goal_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read to all on goal_tasks" ON public.goal_tasks FOR SELECT USING (true);
CREATE POLICY "Allow insert to all on goal_tasks" ON public.goal_tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to all on goal_tasks" ON public.goal_tasks FOR UPDATE USING (true) WITH CHECK (true);
-- Allow owner (via goal) to delete goal_tasks links
CREATE POLICY "Allow delete to all on goal_tasks" ON public.goal_tasks FOR DELETE USING (true);

-- Associate a private collectible to a goal (owner-only, shown in rewards for owner)
CREATE TABLE IF NOT EXISTS public.goal_collectibles (
  goal_id uuid PRIMARY KEY REFERENCES public.goals(id) ON DELETE CASCADE,
  collectible_id uuid NOT NULL REFERENCES public.collectibles(id) ON DELETE CASCADE
);

ALTER TABLE public.goal_collectibles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read to all on goal_collectibles" ON public.goal_collectibles FOR SELECT USING (true);
CREATE POLICY "Allow insert to all on goal_collectibles" ON public.goal_collectibles FOR INSERT WITH CHECK (true);
-- Allow owner (via goal) to delete goal_collectibles
CREATE POLICY "Allow delete to all on goal_collectibles" ON public.goal_collectibles FOR DELETE USING (true);

-- Streak revives: allow reviving a missed day for a goal by spending diamonds
CREATE TABLE IF NOT EXISTS public.goal_streak_revives (
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  revive_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(goal_id, user_id, revive_date)
);

ALTER TABLE public.goal_streak_revives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read to all on goal_streak_revives" ON public.goal_streak_revives FOR SELECT USING (true);
CREATE POLICY "Allow insert to all on goal_streak_revives" ON public.goal_streak_revives FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow delete to all on goal_streak_revives" ON public.goal_streak_revives FOR DELETE USING (true);

-- Life Streak: tracks days where all scheduled tasks were completed
CREATE TABLE IF NOT EXISTS public.life_streak_days (
  user_id TEXT NOT NULL,
  day DATE NOT NULL,
  counted BOOLEAN NOT NULL DEFAULT TRUE,
  revived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, day)
);

ALTER TABLE public.life_streak_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read to all on life_streak_days" ON public.life_streak_days FOR SELECT USING (true);
CREATE POLICY "Allow insert to all on life_streak_days" ON public.life_streak_days FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to all on life_streak_days" ON public.life_streak_days FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete to all on life_streak_days" ON public.life_streak_days FOR DELETE USING (true);

-- RPC: perform life streak revive in a single transaction
CREATE OR REPLACE FUNCTION public.perform_life_streak_revive(p_user_id TEXT, p_day DATE, p_cost INT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance INT;
BEGIN
  -- Lock the user_progress row to prevent race conditions
  PERFORM 1 FROM public.user_progress WHERE user_id = p_user_id FOR UPDATE;

  SELECT diamonds INTO v_balance FROM public.user_progress WHERE user_id = p_user_id;
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'User progress not found';
  END IF;
  IF v_balance < p_cost THEN
    RAISE EXCEPTION 'Insufficient diamonds';
  END IF;

  -- Ensure not already counted
  IF EXISTS (SELECT 1 FROM public.life_streak_days WHERE user_id = p_user_id AND day = p_day) THEN
    RAISE EXCEPTION 'Already counted';
  END IF;

  -- Deduct diamonds
  UPDATE public.user_progress SET diamonds = diamonds - p_cost WHERE user_id = p_user_id;

  -- Ledger entry
  INSERT INTO public.diamond_ledger (user_id, delta, reason)
  VALUES (p_user_id, -p_cost, 'life_streak_revive');

  -- Insert life streak day
  INSERT INTO public.life_streak_days (user_id, day, counted, revived)
  VALUES (p_user_id, p_day, TRUE, TRUE);

END;
$$;

-- Helper function: weekly success count between dates for a goal
CREATE OR REPLACE FUNCTION public.fn_goal_weekly_success(p_goal_id uuid)
RETURNS TABLE(week_start DATE, success BOOLEAN) AS $body$
WITH t AS (
  SELECT gt.id as goal_task_id, gtt.times_per_period
  FROM public.goal_tasks gt
  JOIN public.goal_task_templates gtt ON gtt.id = gt.template_id
  WHERE gt.goal_id = p_goal_id AND gtt.frequency = 'weekly'
),
g AS (
  SELECT g.start_date, g.deadline FROM public.goals g WHERE g.id = p_goal_id
), weeks AS (
  SELECT generate_series(date_trunc('week', g.start_date)::date, g.deadline, interval '1 week')::date AS week_start
  FROM g
), comp AS (
  SELECT date_trunc('week', tc.completed_on)::date AS week_start, gt.id as goal_task_id, count(*) as cnt
  FROM public.task_completions tc
  JOIN public.goal_tasks gt ON gt.task_id = tc.task_id
  WHERE gt.goal_id = p_goal_id
  GROUP BY 1,2
)
SELECT w.week_start,
       COALESCE(
         (
           SELECT bool_and(c.cnt >= t.times_per_period)
           FROM t
           LEFT JOIN comp c ON c.goal_task_id = t.goal_task_id AND c.week_start = w.week_start
         ), false
       ) AS success
FROM weeks w
ORDER BY w.week_start;
$body$ LANGUAGE sql STABLE;

-- Track claims to prevent double-granting
CREATE TABLE IF NOT EXISTS public.user_reward_claims (
  user_id TEXT NOT NULL,
  reward_id uuid NOT NULL REFERENCES public.rewards(id) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, reward_id)
);

ALTER TABLE public.user_reward_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read user_reward_claims" ON public.user_reward_claims FOR SELECT USING (true);
CREATE POLICY "Allow insert user_reward_claims" ON public.user_reward_claims FOR INSERT WITH CHECK (true);

-- View: cumulative EP ranges per level
CREATE OR REPLACE VIEW public.v_levels_cumulative AS
WITH l AS (
  SELECT level, ep_required,
         SUM(ep_required) OVER (ORDER BY level ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum_ep_next
  FROM public.levels
)
SELECT level,
       ep_required,
       COALESCE(LAG(cum_ep_next) OVER (ORDER BY level), 0) AS cum_ep_from,
       cum_ep_next AS cum_ep_to
FROM l;

-- View: rewards joined with collectible metadata
CREATE OR REPLACE VIEW public.v_rewards_config AS
SELECT
  r.id AS reward_id,
  r.kind,
  r.amount,
  r.collectible_id,
  r.unlock_rule,
  r.unlock_level,
  r.unlock_ep,
  r.group_id,
  c.name AS collectible_name,
  c.icon AS collectible_icon,
  c.rarity AS collectible_rarity
FROM public.rewards r
LEFT JOIN public.collectibles c ON c.id = r.collectible_id;

-- =============================
-- Badges and gating rules
-- =============================

-- Distinguish badges from regular collectibles
ALTER TABLE public.collectibles
  ADD COLUMN IF NOT EXISTS is_badge BOOLEAN NOT NULL DEFAULT FALSE;

-- Requirements to purchase/use a collectible
CREATE TABLE IF NOT EXISTS public.collectibles_requirements (
  collectible_id uuid PRIMARY KEY REFERENCES public.collectibles(id) ON DELETE CASCADE,
  min_level INTEGER NOT NULL DEFAULT 1,
  required_badge_id uuid NULL REFERENCES public.collectibles(id) ON DELETE SET NULL,
  required_goal_id uuid NULL,                        -- goal that must be completed
  require_goal_success BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure new columns exist if table already created previously
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='collectibles_requirements') THEN
    BEGIN
      ALTER TABLE public.collectibles_requirements ADD COLUMN IF NOT EXISTS required_goal_id uuid;
      ALTER TABLE public.collectibles_requirements ADD COLUMN IF NOT EXISTS require_goal_success BOOLEAN NOT NULL DEFAULT FALSE;
    EXCEPTION WHEN duplicate_column THEN
      NULL;
    END;
  END IF;
END $$;

ALTER TABLE public.collectibles_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read to all on collectibles_requirements" ON public.collectibles_requirements FOR SELECT USING (true);
CREATE POLICY "Allow insert to all on collectibles_requirements" ON public.collectibles_requirements FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to all on collectibles_requirements" ON public.collectibles_requirements FOR UPDATE USING (true) WITH CHECK (true);

-- =============================
-- Auto-grant rewards on level up / EP thresholds
-- =============================
CREATE OR REPLACE FUNCTION public.fn_grant_rewards_on_progress_change()
RETURNS trigger AS $grant$
DECLARE
  r RECORD;
  unlocked BOOLEAN;
BEGIN
  -- For each reward, check unlock condition and if not already claimed, grant
  FOR r IN SELECT * FROM public.rewards LOOP
    IF r.unlock_rule = 'level' THEN
      unlocked := NEW.level >= r.unlock_level;
    ELSE
      unlocked := (NEW.total_ep IS NOT NULL) AND (r.unlock_ep IS NOT NULL) AND (NEW.total_ep >= r.unlock_ep);
    END IF;

    IF unlocked THEN
      -- Skip if already claimed
      IF NOT EXISTS (
        SELECT 1 FROM public.user_reward_claims c
        WHERE c.user_id = NEW.user_id AND c.reward_id = r.id
      ) THEN
        IF r.kind = 'diamond' AND r.amount IS NOT NULL AND r.amount > 0 THEN
          UPDATE public.user_progress SET diamonds = diamonds + r.amount WHERE user_id = NEW.user_id;
          INSERT INTO public.diamond_ledger(user_id, delta, reason) VALUES (NEW.user_id, r.amount, 'reward');
        ELSIF r.kind = 'collectible' AND r.collectible_id IS NOT NULL THEN
          INSERT INTO public.user_collectibles(user_id, collectible_id, source)
          VALUES (NEW.user_id, r.collectible_id, 'reward')
          ON CONFLICT (user_id, collectible_id) DO NOTHING;
        END IF;
        INSERT INTO public.user_reward_claims(user_id, reward_id) VALUES (NEW.user_id, r.id)
        ON CONFLICT (user_id, reward_id) DO NOTHING;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$grant$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_grant_rewards_on_progress_change'
  ) THEN
    CREATE TRIGGER trg_grant_rewards_on_progress_change
    AFTER INSERT OR UPDATE OF level, total_ep ON public.user_progress
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_grant_rewards_on_progress_change();
  END IF;
END $$;
