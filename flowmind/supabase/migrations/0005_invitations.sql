-- Phase 1 (schema-only; consumed in Phase 2): invitations table.
-- Invite-by-email is created by owners/admins. No email is sent — the UI
-- displays the copyable /accept-invite?token=<token> URL for Phase 2.

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'member', 'viewer')),
  invited_by uuid references auth.users(id) on delete set null,
  token text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Partial unique: one live pending invite per (org, email).
create unique index invitations_pending_unique
  on public.invitations (org_id, email)
  where accepted_at is null;

create index invitations_org_id_idx on public.invitations (org_id);
create index invitations_token_idx on public.invitations (token);

alter table public.invitations enable row level security;
alter table public.invitations force row level security;

-- Members see pending invites for their org (useful for the org settings UI).
create policy invitations_member_select on public.invitations
  for select using (public.is_org_member(org_id));

-- Owners/admins create/revoke invites.
create policy invitations_admin_insert on public.invitations
  for insert with check (public.org_role(org_id) in ('owner', 'admin'));

create policy invitations_admin_update on public.invitations
  for update using (public.org_role(org_id) in ('owner', 'admin'))
  with check (public.org_role(org_id) in ('owner', 'admin'));

create policy invitations_admin_delete on public.invitations
  for delete using (public.org_role(org_id) in ('owner', 'admin'));

-- Token-based acceptance lives in the Next.js accept-invite route using the
-- service role — there is no anon-accessible select policy, which is fine
-- because the server route reads the row by token server-side.
