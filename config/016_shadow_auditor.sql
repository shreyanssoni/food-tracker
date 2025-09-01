-- Phase 3: Auditor + Fixer scaffolding for Shadow mirrors on tasks
-- Assumptions:
--  - User-created tasks: tasks.user_id TEXT, owner_type IS NULL or 'user'
--  - Shadow mirror tasks: tasks.user_id TEXT (same), owner_type = 'shadow', owner_id = shadow_profile.id (UUID)
--  - Optional linkage: tasks.parent_task_id references the user task (we'll backfill where possible)

-- Helpful indexes
CREATE INDEX IF NOT EXISTS tasks_parent_idx ON public.tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS tasks_user_owner_idx ON public.tasks(user_id, owner_type);

-- View: user tasks (base)
CREATE OR REPLACE VIEW public.v_user_tasks AS
SELECT t.*
FROM public.tasks t
WHERE COALESCE(t.owner_type::text, 'user') = 'user';

-- View: shadow mirror tasks
CREATE OR REPLACE VIEW public.v_shadow_tasks AS
SELECT t.*
FROM public.tasks t
WHERE t.owner_type::text = 'shadow';

-- View: mirror status per user task
--  - mirrors_by_parent: count mirrors linked via parent_task_id
--  - candidate_mirrors_by_title: mirrors matching title when no parent link (heuristic)
CREATE OR REPLACE VIEW public.v_task_mirror_status AS
WITH mirrors AS (
  SELECT st.id AS shadow_id, st.parent_task_id, st.user_id, st.title
  FROM public.v_shadow_tasks st
),
by_parent AS (
  SELECT ut.id AS user_task_id, COUNT(m.shadow_id) AS mirrors_by_parent
  FROM public.v_user_tasks ut
  LEFT JOIN mirrors m ON m.parent_task_id = ut.id
  GROUP BY ut.id
),
by_title AS (
  SELECT ut.id AS user_task_id, COUNT(m.shadow_id) AS candidate_mirrors_by_title
  FROM public.v_user_tasks ut
  LEFT JOIN mirrors m ON m.parent_task_id IS NULL AND m.user_id = ut.user_id AND m.title = ut.title
  GROUP BY ut.id
)
SELECT ut.id AS user_task_id,
       COALESCE(bp.mirrors_by_parent, 0) AS mirrors_by_parent,
       COALESCE(bt.candidate_mirrors_by_title, 0) AS candidate_mirrors_by_title
FROM public.v_user_tasks ut
LEFT JOIN by_parent bp ON bp.user_task_id = ut.id
LEFT JOIN by_title bt ON bt.user_task_id = ut.id;

-- Function: backfill a parent link for a user task by heuristic match
CREATE OR REPLACE FUNCTION public.shadow_fix_link_parent(p_user_task_id uuid)
RETURNS int AS $$
DECLARE
  v_user_id text;
  v_title text;
  v_shadow_id uuid;
BEGIN
  SELECT user_id, title INTO v_user_id, v_title FROM public.tasks WHERE id = p_user_task_id;
  IF v_user_id IS NULL THEN RETURN 0; END IF;

  -- Find exactly one candidate shadow task without parent link that matches user and title
  SELECT st.id INTO v_shadow_id
  FROM public.v_shadow_tasks st
  WHERE st.parent_task_id IS NULL AND st.user_id = v_user_id AND st.title = v_title
  ORDER BY st.created_at ASC
  LIMIT 1;

  IF v_shadow_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.tasks SET parent_task_id = p_user_task_id WHERE id = v_shadow_id;
  RETURN 1;
END;
$$ LANGUAGE plpgsql;
