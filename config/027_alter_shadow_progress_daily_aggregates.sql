-- Adds aggregate columns to shadow_progress_daily for persisted metrics
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shadow_progress_daily' AND column_name = 'time_saved_minutes'
  ) THEN
    ALTER TABLE shadow_progress_daily ADD COLUMN time_saved_minutes numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shadow_progress_daily' AND column_name = 'pace_consistency'
  ) THEN
    ALTER TABLE shadow_progress_daily ADD COLUMN pace_consistency numeric;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shadow_progress_daily' AND column_name = 'delta_now'
  ) THEN
    ALTER TABLE shadow_progress_daily ADD COLUMN delta_now numeric;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shadow_progress_daily' AND column_name = 'user_speed_now'
  ) THEN
    ALTER TABLE shadow_progress_daily ADD COLUMN user_speed_now numeric;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shadow_progress_daily' AND column_name = 'shadow_speed_now'
  ) THEN
    ALTER TABLE shadow_progress_daily ADD COLUMN shadow_speed_now numeric;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shadow_progress_daily' AND column_name = 'last_computed_at'
  ) THEN
    ALTER TABLE shadow_progress_daily ADD COLUMN last_computed_at timestamptz;
  END IF;
END $$;
