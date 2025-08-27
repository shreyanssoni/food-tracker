-- Avatars & Collectibles schema
-- Safe to run multiple times (IF NOT EXISTS)

create table if not exists avatars (
  avatar_id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  level int not null default 1,
  current_ep int not null default 0,
  required_ep int not null default 100,
  appearance_stage text not null default 'stage1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

-- NOTE: collectibles and user_collectibles already exist in this project.
-- We do NOT redefine them here to avoid conflicts. This file only adds the new avatar-related tables.

create table if not exists avatar_equipment (
  user_id text not null primary key,
  weapon uuid references public.collectibles(id) on delete set null,
  armor uuid references public.collectibles(id) on delete set null,
  cosmetic uuid references public.collectibles(id) on delete set null,
  pet uuid references public.collectibles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists notifications (
  notif_id uuid primary key default gen_random_uuid(),
  user_id text not null,
  message text not null,
  triggered_by text not null check (triggered_by in ('task_complete','level_up','system')),
  created_at timestamptz not null default now()
);

create table if not exists avatar_level_ups (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  from_level int not null,
  to_level int not null,
  awarded_collectible_id uuid references public.collectibles(id),
  created_at timestamptz not null default now()
);




create policy avatars_insert
on public.avatars for insert
to authenticated
with check (user_id = auth.uid()::text);

-- Allow users to read their own avatar row
create policy if not exists avatars_select
on public.avatars for select
to authenticated
using (user_id = auth.uid()::text);

-- Allow users to read their own equipment row
create policy if not exists avatar_equipment_select
on public.avatar_equipment for select
to authenticated
using (user_id = auth.uid()::text);

-- =========================
-- DB-level sync: avatar stage mirrors user_progress.level
-- =========================
create or replace function public.stage_for(level int)
returns text
language sql
as $$
  select case
    when level >= 30 then 'stage6'
    when level >= 20 then 'stage5'
    when level >= 15 then 'stage4'
    when level >= 10 then 'stage3'
    when level >= 5 then 'stage2'
    else 'stage1'
  end;
$$;

create or replace function public.sync_avatar_stage_from_progress()
returns trigger
language plpgsql
as $$
begin
  update public.avatars a
  set appearance_stage = public.stage_for(new.level),
      updated_at = now()
  where a.user_id = new.user_id;
  return new;
end;
$$;

drop trigger if exists trg_sync_avatar_stage on public.user_progress;
create trigger trg_sync_avatar_stage
after insert or update of level on public.user_progress
for each row
execute procedure public.sync_avatar_stage_from_progress();

