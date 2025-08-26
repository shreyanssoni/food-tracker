-- Backfill task_schedules.timezone from user_preferences.timezone
-- Safe to run multiple times. It only updates rows with NULL or 'UTC' timezone
-- Preview: see impact before running update

-- 1) Preview counts by prospective timezone
SELECT up.timezone AS new_timezone, COUNT(*) AS rows_to_update
FROM task_schedules ts
JOIN user_preferences up ON up.user_id = ts.user_id
WHERE up.timezone IS NOT NULL
  AND (ts.timezone IS NULL OR ts.timezone = 'UTC')
GROUP BY up.timezone
ORDER BY rows_to_update DESC;

-- 2) Optional: preview affected rows (limited)
SELECT ts.id, ts.user_id, ts.timezone AS old_timezone, up.timezone AS new_timezone
FROM task_schedules ts
JOIN user_preferences up ON up.user_id = ts.user_id
WHERE up.timezone IS NOT NULL
  AND (ts.timezone IS NULL OR ts.timezone = 'UTC')
LIMIT 200;

-- 3) Perform the backfill
UPDATE task_schedules AS ts
SET timezone = up.timezone,
    updated_at = NOW()
FROM user_preferences AS up
WHERE up.user_id = ts.user_id
  AND up.timezone IS NOT NULL
  AND (ts.timezone IS NULL OR ts.timezone = 'UTC');

-- 4) Verify
SELECT timezone, COUNT(*) AS rows_after
FROM task_schedules
GROUP BY timezone
ORDER BY rows_after DESC;
