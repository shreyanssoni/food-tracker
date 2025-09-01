-- Adds expected_at to shadow_progress_daily to support time_saved calculations
-- Safe to run multiple times (checks existence)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'shadow_progress_daily'
      AND column_name = 'expected_at'
  ) THEN
    ALTER TABLE shadow_progress_daily
      ADD COLUMN expected_at TIMESTAMPTZ NULL;
  END IF;
END $$;
