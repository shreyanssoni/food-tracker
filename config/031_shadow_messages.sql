-- Shadow Messages table for Dashboard Inbox
-- Creates a per-user message stream with type, text, expiry and creation time

-- Ensure pgcrypto for gen_random_uuid()
create extension if not exists pgcrypto;

create table if not exists public.shadow_messages (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  type text not null check (type in ('taunt','encouragement','neutral')),
  text text not null,
  expiry timestamptz not null,
  created_at timestamptz not null default now()
);

-- Helpful indexes for fast lookups
create index if not exists shadow_messages_user_created_idx
  on public.shadow_messages (user_id, created_at desc);

create index if not exists shadow_messages_user_expiry_idx
  on public.shadow_messages (user_id, expiry);

-- RLS: users can only see and modify their own messages
alter table public.shadow_messages enable row level security;

-- Select own messages
create policy if not exists "shadow_messages_select_own"
  on public.shadow_messages
  for select
  using (user_id = auth.uid()::text);

-- Insert for self
create policy if not exists "shadow_messages_insert_self"
  on public.shadow_messages
  for insert
  with check (user_id = auth.uid()::text);

-- Update own messages
create policy if not exists "shadow_messages_update_own"
  on public.shadow_messages
  for update
  using (user_id = auth.uid()::text);

-- Delete own messages
create policy if not exists "shadow_messages_delete_own"
  on public.shadow_messages
  for delete
  using (user_id = auth.uid()::text);

-- Note: Ensure Realtime is enabled for this table in the Supabase dashboard if you want live updates.
