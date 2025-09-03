-- Create table to store multiple FCM tokens per user
create table if not exists public.fcm_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text check (platform in ('android','ios','web')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, token)
);

-- Index for quick lookup by user
create index if not exists fcm_tokens_user_id_idx on public.fcm_tokens(user_id);

-- Enable RLS (we'll use service role for writes via server)
alter table public.fcm_tokens enable row level security;

-- Optional policy to allow users to view their own tokens (not necessary if only server accesses)
create policy if not exists "Users can view their tokens"
  on public.fcm_tokens for select
  using (auth.uid() = user_id);
