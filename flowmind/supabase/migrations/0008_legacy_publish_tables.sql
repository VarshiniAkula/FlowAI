-- Legacy public demo tables for the publish / hosted-chat / analytics routes
-- (anon-key access). Recreated in the consolidated project so ONE Supabase
-- backend serves auth + per-user data AND the public publish demo. These are
-- intentionally public (the publish route uses the anon key); they hold no
-- private per-user data.

create table if not exists public.flowmind_published_assistants (
  id text primary key,
  assistant_id text,
  name text,
  description text,
  graph jsonb,
  version integer not null default 1,
  published_at timestamptz not null default now()
);

create table if not exists public.flowmind_conversations (
  id text primary key,
  publish_id text,
  assistant_id text,
  started_at timestamptz not null default now(),
  turn_count integer not null default 0,
  status text not null default 'active'
);

alter table public.flowmind_published_assistants enable row level security;
alter table public.flowmind_conversations enable row level security;

create policy "public_read_published" on public.flowmind_published_assistants for select using (true);
create policy "public_insert_published" on public.flowmind_published_assistants for insert with check (true);

create policy "public_read_convos" on public.flowmind_conversations for select using (true);
create policy "public_insert_convos" on public.flowmind_conversations for insert with check (true);
create policy "public_update_convos" on public.flowmind_conversations for update using (true) with check (true);

grant select, insert on public.flowmind_published_assistants to anon, authenticated;
grant select, insert, update on public.flowmind_conversations to anon, authenticated;

create index if not exists flowmind_published_assistant_id_idx on public.flowmind_published_assistants (assistant_id);
create index if not exists flowmind_convos_assistant_id_idx on public.flowmind_conversations (assistant_id);
