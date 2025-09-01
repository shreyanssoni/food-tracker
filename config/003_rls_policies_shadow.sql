-- 003_rls_policies_shadow.sql
-- RLS enablement and policies for new Shadow tables

DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.shadow_profile ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.shadow_tasks ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.shadow_task_instances ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.alignment_log ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

DROP POLICY IF EXISTS shadow_profile_sel ON public.shadow_profile;
DROP POLICY IF EXISTS shadow_profile_mod ON public.shadow_profile;
CREATE POLICY shadow_profile_sel ON public.shadow_profile
  FOR SELECT USING (user_id::text = auth.uid()::text);
CREATE POLICY shadow_profile_mod ON public.shadow_profile
  FOR ALL USING (user_id::text = auth.uid()::text) WITH CHECK (user_id::text = auth.uid()::text);

DROP POLICY IF EXISTS shadow_tasks_sel ON public.shadow_tasks;
DROP POLICY IF EXISTS shadow_tasks_mod ON public.shadow_tasks;
CREATE POLICY shadow_tasks_sel ON public.shadow_tasks
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.shadow_profile sp
    WHERE sp.id = shadow_tasks.shadow_id AND sp.user_id::text = auth.uid()::text
  ));
CREATE POLICY shadow_tasks_mod ON public.shadow_tasks
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.shadow_profile sp
    WHERE sp.id = shadow_tasks.shadow_id AND sp.user_id::text = auth.uid()::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.shadow_profile sp
    WHERE sp.id = shadow_tasks.shadow_id AND sp.user_id::text = auth.uid()::text
  ));

DROP POLICY IF EXISTS shadow_instances_sel ON public.shadow_task_instances;
DROP POLICY IF EXISTS shadow_instances_mod ON public.shadow_task_instances;
CREATE POLICY shadow_instances_sel ON public.shadow_task_instances
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.shadow_tasks st
    JOIN public.shadow_profile sp ON sp.id = st.shadow_id
    WHERE st.id = shadow_task_instances.shadow_task_id AND sp.user_id::text = auth.uid()::text
  ));
CREATE POLICY shadow_instances_mod ON public.shadow_task_instances
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.shadow_tasks st
    JOIN public.shadow_profile sp ON sp.id = st.shadow_id
    WHERE st.id = shadow_task_instances.shadow_task_id AND sp.user_id::text = auth.uid()::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.shadow_tasks st
    JOIN public.shadow_profile sp ON sp.id = st.shadow_id
    WHERE st.id = shadow_task_instances.shadow_task_id AND sp.user_id::text = auth.uid()::text
  ));

DROP POLICY IF EXISTS alignment_log_sel ON public.alignment_log;
DROP POLICY IF EXISTS alignment_log_ins ON public.alignment_log;
CREATE POLICY alignment_log_sel ON public.alignment_log
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY alignment_log_ins ON public.alignment_log
  FOR INSERT WITH CHECK (user_id = auth.uid());
