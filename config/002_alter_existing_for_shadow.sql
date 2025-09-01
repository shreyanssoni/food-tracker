-- 002_alter_existing_for_shadow.sql
-- Non-breaking alterations to existing tables for Shadow + Notifications

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE notification_type AS ENUM ('push', 'focused', 'both');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_channel') THEN
    CREATE TYPE notification_channel AS ENUM ('system', 'shadow', 'rewards', 'tasks');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_seen_status') THEN
    CREATE TYPE notification_seen_status AS ENUM ('unseen', 'seen', 'dismissed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_interaction') THEN
    CREATE TYPE notification_interaction AS ENUM ('clicked', 'ignored', 'snoozed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reward_source') THEN
    CREATE TYPE reward_source AS ENUM ('task', 'shadow_competition', 'streak', 'special_event');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reward_type') THEN
    CREATE TYPE reward_type AS ENUM ('EP', 'badge', 'collectible', 'unlockable');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'streak_type') THEN
    CREATE TYPE streak_type AS ENUM ('user', 'shadow', 'competition');
  END IF;
END$$;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS type notification_type,
  ADD COLUMN IF NOT EXISTS channel notification_channel,
  ADD COLUMN IF NOT EXISTS seen_status notification_seen_status DEFAULT 'unseen',
  ADD COLUMN IF NOT EXISTS interaction notification_interaction;

ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS source reward_source,
  ADD COLUMN IF NOT EXISTS reward_type reward_type;

-- Only alter streaks if the table exists in this project
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'streaks'
  ) THEN
    EXECUTE 'ALTER TABLE public.streaks
      ADD COLUMN IF NOT EXISTS grace_days int DEFAULT 0,
      ADD COLUMN IF NOT EXISTS streak_type streak_type DEFAULT ''user''';
  END IF;
END$$;
