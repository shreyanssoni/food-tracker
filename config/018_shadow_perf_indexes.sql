-- Phase 11: Performance indexes for Shadow progress flow

-- Task completions lookup by user and day
CREATE INDEX IF NOT EXISTS idx_task_completions_user_day
  ON public.task_completions (user_id, completed_on);

-- Tasks filtering by id and owner_type (helps exclude shadow-owned)
CREATE INDEX IF NOT EXISTS idx_tasks_id_owner_type
  ON public.tasks (id, owner_type);

-- User messages recent-by-user for rate limiting
CREATE INDEX IF NOT EXISTS idx_user_messages_user_created_at
  ON public.user_messages (user_id, created_at DESC);

-- Shadow dry run logs by user and created_at for observability
CREATE INDEX IF NOT EXISTS idx_shadow_dry_run_logs_user_created_at
  ON public.shadow_dry_run_logs (user_id, created_at DESC);

-- Shadow progress commits quick read by (user_id, day)
-- Unique already exists via 017; add created_at for recency queries
CREATE INDEX IF NOT EXISTS idx_shadow_progress_commits_user_created_at
  ON public.shadow_progress_commits (user_id, created_at DESC);
