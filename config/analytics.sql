create table if not exists analytics_events (
  id bigserial primary key,
  user_id text,
  event text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table analytics_events enable row level security;

-- Allow authenticated users to insert their own events
create policy analytics_insert_authenticated
on analytics_events
for insert
to authenticated
with check (true);

create index if not exists analytics_events_event_idx on analytics_events(event);
create index if not exists analytics_events_created_at_idx on analytics_events(created_at);