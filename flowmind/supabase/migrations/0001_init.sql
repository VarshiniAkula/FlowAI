-- Phase 1: FlowMind schema init.
-- Tables land in dependency order. RLS is turned on in 0003_rls.sql.

create extension if not exists "pgcrypto";
create extension if not exists "vector";
create extension if not exists "pg_trgm";

-- Shared trigger to keep updated_at fresh.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- profiles ------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated
before update on public.profiles
for each row execute function public.set_updated_at();

-- organizations -------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_organizations_updated
before update on public.organizations
for each row execute function public.set_updated_at();

-- memberships ---------------------------------------------------------------
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

-- assistants ----------------------------------------------------------------
create table public.assistants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  description text,
  status text not null default 'draft',
  graph jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_assistants_updated
before update on public.assistants
for each row execute function public.set_updated_at();

-- knowledge_sources ---------------------------------------------------------
create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  assistant_id uuid not null references public.assistants(id) on delete cascade,
  type text not null check (type in ('file', 'url', 'text', 'api')),
  uri text,
  title text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_knowledge_sources_updated
before update on public.knowledge_sources
for each row execute function public.set_updated_at();

-- documents -----------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  assistant_id uuid not null references public.assistants(id) on delete cascade,
  source_id uuid references public.knowledge_sources(id) on delete cascade,
  storage_path text,
  name text not null,
  mime_type text,
  sha256 text,
  size_bytes bigint,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_documents_updated
before update on public.documents
for each row execute function public.set_updated_at();

-- document_chunks -----------------------------------------------------------
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  assistant_id uuid not null references public.assistants(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_count integer,
  embedding vector(768),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

-- published_assistants ------------------------------------------------------
create table public.published_assistants (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  org_id uuid not null references public.organizations(id) on delete cascade,
  assistant_id uuid not null references public.assistants(id) on delete cascade,
  version integer not null default 1,
  graph_snapshot jsonb not null,
  settings_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'published' check (status in ('published', 'disabled')),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_published_assistants_updated
before update on public.published_assistants
for each row execute function public.set_updated_at();

-- conversations -------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  assistant_id uuid not null references public.assistants(id) on delete cascade,
  published_assistant_id uuid references public.published_assistants(id) on delete set null,
  session_id text,
  user_id uuid references auth.users(id) on delete set null,
  channel text not null default 'web',
  created_at timestamptz not null default now()
);

-- messages ------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- usage_events --------------------------------------------------------------
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  assistant_id uuid not null references public.assistants(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
