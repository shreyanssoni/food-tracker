-- 006_rls_challenges_ledger.sql
-- Enable RLS and define policies for new tables (idempotent, user-scoped)

-- Enable RLS with guards
DO $$ BEGIN EXECUTE 'ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'ALTER TABLE public.entity_ep_ledger ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'ALTER TABLE public.ai_requests_log ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'ALTER TABLE public.shadow_daily_stats ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Challenges: owned by user_id
DROP POLICY IF EXISTS challenges_sel ON public.challenges;
DROP POLICY IF EXISTS challenges_mod ON public.challenges;
CREATE POLICY challenges_sel ON public.challenges
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY challenges_mod ON public.challenges
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- AI requests: owned by user_id
DROP POLICY IF EXISTS ai_requests_sel ON public.ai_requests_log;
DROP POLICY IF EXISTS ai_requests_mod ON public.ai_requests_log;
CREATE POLICY ai_requests_sel ON public.ai_requests_log
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY ai_requests_mod ON public.ai_requests_log
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- entity_ep_ledger: rows visible if they belong to the user or the user's shadow profile
-- We assume one shadow_profile per user (enforced by UNIQUE in shadow_profile).
DROP POLICY IF EXISTS entity_ledger_sel ON public.entity_ep_ledger;
DROP POLICY IF EXISTS entity_ledger_ins ON public.entity_ep_ledger;
CREATE POLICY entity_ledger_sel ON public.entity_ep_ledger
  FOR SELECT USING (
    (entity_type = 'user'::entity_type AND entity_id = auth.uid())
    OR
    (entity_type = 'shadow'::entity_type AND EXISTS (
      SELECT 1 FROM public.shadow_profile sp
      WHERE sp.user_id = auth.uid() AND sp.id = entity_ep_ledger.entity_id
    ))
  );
CREATE POLICY entity_ledger_ins ON public.entity_ep_ledger
  FOR INSERT WITH CHECK (
    (entity_type = 'user'::entity_type AND entity_id = auth.uid())
    OR
    (entity_type = 'shadow'::entity_type AND EXISTS (
      SELECT 1 FROM public.shadow_profile sp
      WHERE sp.user_id = auth.uid() AND sp.id = entity_ep_ledger.entity_id
    ))
  );

-- shadow_daily_stats: join through shadow_profile
DROP POLICY IF EXISTS shadow_daily_stats_sel ON public.shadow_daily_stats;
DROP POLICY IF EXISTS shadow_daily_stats_mod ON public.shadow_daily_stats;
CREATE POLICY shadow_daily_stats_sel ON public.shadow_daily_stats
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.shadow_profile sp
    WHERE sp.id = shadow_daily_stats.shadow_profile_id AND sp.user_id = auth.uid()
  ));
CREATE POLICY shadow_daily_stats_mod ON public.shadow_daily_stats
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.shadow_profile sp
    WHERE sp.id = shadow_daily_stats.shadow_profile_id AND sp.user_id = auth.uid()
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.shadow_profile sp
    WHERE sp.id = shadow_daily_stats.shadow_profile_id AND sp.user_id = auth.uid()
  ));
