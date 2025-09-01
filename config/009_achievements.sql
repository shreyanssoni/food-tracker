-- 009_achievements.sql
-- Minimal achievements schema + RLS (idempotent)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='achievements') THEN
    CREATE TABLE public.achievements (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code          text UNIQUE NOT NULL,
      name          text NOT NULL,
      description   text,
      icon          text,
      created_at    timestamptz NOT NULL DEFAULT now()
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_achievements') THEN
    CREATE TABLE public.user_achievements (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      achievement_id  uuid NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
      awarded_at      timestamptz NOT NULL DEFAULT now(),
      meta            jsonb DEFAULT '{}'::jsonb,
      UNIQUE (user_id, achievement_id)
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='achievement_events') THEN
    CREATE TABLE public.achievement_events (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      event_type    text NOT NULL, -- e.g., 'shadow_challenge_win', 'shadow_challenge_loss'
      ref_id        uuid,          -- optional reference (e.g., shadow_challenges.id)
      meta          jsonb DEFAULT '{}'::jsonb,
      created_at    timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END$$;

-- Enable RLS
DO $$ BEGIN EXECUTE 'ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'ALTER TABLE public.achievement_events ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Policies: per-user isolation
DROP POLICY IF EXISTS user_achievements_all ON public.user_achievements;
CREATE POLICY user_achievements_all ON public.user_achievements
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS achievement_events_all ON public.achievement_events;
CREATE POLICY achievement_events_all ON public.achievement_events
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Seed a couple of example achievements (safe upsert)
INSERT INTO public.achievements (code, name, description) VALUES
  ('first_shadow_win', 'First Victory', 'Win your first Shadow challenge.'),
  ('five_shadow_wins', 'Warm Streak', 'Win 5 Shadow challenges.'),
  ('three_day_streak', 'On a Roll', 'Win Shadow challenges 3 days in a row.')
ON CONFLICT (code) DO NOTHING;
