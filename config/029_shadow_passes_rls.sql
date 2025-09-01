-- 029_shadow_passes_rls.sql
-- Enable RLS and add minimal policies for shadow_passes
-- Users can SELECT only their own rows. Writes are reserved for service role.

alter table if exists public.shadow_passes enable row level security;

-- Avoid duplicate creation
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'shadow_passes' and policyname = 'Allow select own shadow_passes'
  ) then
    create policy "Allow select own shadow_passes"
      on public.shadow_passes
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

-- Optional: allow service role full access (bypasses RLS anyway), no additional policy needed.
