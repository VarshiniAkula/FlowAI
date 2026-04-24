-- Phase 1: RLS policies for FlowMind.
-- Helpers live in public schema and are invoked from policies.

-- Helper: is current user a member of the given org?
create or replace function public.is_org_member(org uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = org and m.user_id = auth.uid()
  );
$$;

-- Helper: current user's role in the given org, or null.
create or replace function public.org_role(org uuid)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select m.role from public.memberships m
  where m.org_id = org and m.user_id = auth.uid()
  limit 1;
$$;

-- Enable RLS everywhere. -----------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.organizations         enable row level security;
alter table public.memberships           enable row level security;
alter table public.assistants            enable row level security;
alter table public.knowledge_sources     enable row level security;
alter table public.documents             enable row level security;
alter table public.document_chunks       enable row level security;
alter table public.published_assistants  enable row level security;
alter table public.conversations         enable row level security;
alter table public.messages              enable row level security;
alter table public.usage_events          enable row level security;

-- Force RLS on owner too so the service role is the only bypass path.
alter table public.profiles              force row level security;
alter table public.organizations         force row level security;
alter table public.memberships           force row level security;
alter table public.assistants            force row level security;
alter table public.knowledge_sources     force row level security;
alter table public.documents             force row level security;
alter table public.document_chunks       force row level security;
alter table public.published_assistants  force row level security;
alter table public.conversations         force row level security;
alter table public.messages              force row level security;
alter table public.usage_events          force row level security;

-- profiles ------------------------------------------------------------------
create policy profiles_self_select on public.profiles
  for select using (id = auth.uid());
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_self_insert on public.profiles
  for insert with check (id = auth.uid());

-- organizations -------------------------------------------------------------
create policy organizations_member_select on public.organizations
  for select using (public.is_org_member(id));

-- Any authenticated user can create an org. bootstrap_organization() then
-- inserts the owner membership in the same transaction.
create policy organizations_authed_insert on public.organizations
  for insert with check (auth.uid() is not null and created_by = auth.uid());

create policy organizations_admin_update on public.organizations
  for update using (public.org_role(id) in ('owner', 'admin'))
  with check (public.org_role(id) in ('owner', 'admin'));

create policy organizations_owner_delete on public.organizations
  for delete using (public.org_role(id) = 'owner');

-- memberships ---------------------------------------------------------------
create policy memberships_member_select on public.memberships
  for select using (public.is_org_member(org_id));

-- Only owners/admins mutate memberships; admins may not touch owner rows.
create policy memberships_owner_admin_insert on public.memberships
  for insert with check (
    public.org_role(org_id) in ('owner', 'admin')
    and (public.org_role(org_id) = 'owner' or role <> 'owner')
  );

create policy memberships_owner_admin_update on public.memberships
  for update using (
    public.org_role(org_id) in ('owner', 'admin')
    and (public.org_role(org_id) = 'owner' or role <> 'owner')
  ) with check (
    public.org_role(org_id) in ('owner', 'admin')
    and (public.org_role(org_id) = 'owner' or role <> 'owner')
  );

create policy memberships_owner_admin_delete on public.memberships
  for delete using (
    public.org_role(org_id) in ('owner', 'admin')
    and (public.org_role(org_id) = 'owner' or role <> 'owner')
  );

-- assistants ----------------------------------------------------------------
create policy assistants_member_select on public.assistants
  for select using (public.is_org_member(org_id));
create policy assistants_writer_insert on public.assistants
  for insert with check (public.org_role(org_id) in ('owner', 'admin', 'member'));
create policy assistants_writer_update on public.assistants
  for update using (public.org_role(org_id) in ('owner', 'admin', 'member'))
  with check (public.org_role(org_id) in ('owner', 'admin', 'member'));
create policy assistants_writer_delete on public.assistants
  for delete using (public.org_role(org_id) in ('owner', 'admin', 'member'));

-- knowledge_sources ---------------------------------------------------------
create policy knowledge_sources_member_select on public.knowledge_sources
  for select using (public.is_org_member(org_id));
create policy knowledge_sources_writer_insert on public.knowledge_sources
  for insert with check (public.org_role(org_id) in ('owner', 'admin', 'member'));
create policy knowledge_sources_writer_update on public.knowledge_sources
  for update using (public.org_role(org_id) in ('owner', 'admin', 'member'))
  with check (public.org_role(org_id) in ('owner', 'admin', 'member'));
create policy knowledge_sources_writer_delete on public.knowledge_sources
  for delete using (public.org_role(org_id) in ('owner', 'admin', 'member'));

-- documents -----------------------------------------------------------------
create policy documents_member_select on public.documents
  for select using (public.is_org_member(org_id));
create policy documents_writer_insert on public.documents
  for insert with check (public.org_role(org_id) in ('owner', 'admin', 'member'));
create policy documents_writer_update on public.documents
  for update using (public.org_role(org_id) in ('owner', 'admin', 'member'))
  with check (public.org_role(org_id) in ('owner', 'admin', 'member'));
create policy documents_writer_delete on public.documents
  for delete using (public.org_role(org_id) in ('owner', 'admin', 'member'));

-- document_chunks -----------------------------------------------------------
create policy document_chunks_member_select on public.document_chunks
  for select using (public.is_org_member(org_id));
create policy document_chunks_writer_insert on public.document_chunks
  for insert with check (public.org_role(org_id) in ('owner', 'admin', 'member'));
create policy document_chunks_writer_update on public.document_chunks
  for update using (public.org_role(org_id) in ('owner', 'admin', 'member'))
  with check (public.org_role(org_id) in ('owner', 'admin', 'member'));
create policy document_chunks_writer_delete on public.document_chunks
  for delete using (public.org_role(org_id) in ('owner', 'admin', 'member'));

-- published_assistants ------------------------------------------------------
-- Members read within org. Public runtime goes through server endpoints with
-- the service role — anon has no select policy here, so direct reads fail.
create policy published_assistants_member_select on public.published_assistants
  for select using (public.is_org_member(org_id));
create policy published_assistants_writer_insert on public.published_assistants
  for insert with check (public.org_role(org_id) in ('owner', 'admin', 'member'));
create policy published_assistants_writer_update on public.published_assistants
  for update using (public.org_role(org_id) in ('owner', 'admin', 'member'))
  with check (public.org_role(org_id) in ('owner', 'admin', 'member'));
create policy published_assistants_writer_delete on public.published_assistants
  for delete using (public.org_role(org_id) in ('owner', 'admin', 'member'));

-- conversations / messages / usage_events -----------------------------------
-- Members can read for analytics. All writes happen via the service role from
-- server endpoints; no insert/update/delete policy is defined, so every
-- non-service-role write is denied by default.
create policy conversations_member_select on public.conversations
  for select using (public.is_org_member(org_id));

create policy messages_member_select on public.messages
  for select using (public.is_org_member(org_id));

create policy usage_events_member_select on public.usage_events
  for select using (public.is_org_member(org_id));
