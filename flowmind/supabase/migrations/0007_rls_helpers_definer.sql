-- Phase 1 fix: make is_org_member() / org_role() SECURITY DEFINER.
--
-- Why: every table policy that calls is_org_member(org_id) reaches into
-- memberships, which itself has an RLS policy that calls is_org_member(...) →
-- infinite recursion (Postgres error 54001 "stack depth limit exceeded").
--
-- The canonical Supabase fix: run these read-only helpers as the function
-- owner so they bypass RLS while evaluating membership. They still return
-- only a boolean / role string — no data leakage path, no DML.
--
-- This is the second and final approved SECURITY DEFINER use in FlowMind
-- (alongside bootstrap_organization). Any future SECURITY DEFINER still
-- requires explicit approval per docs/audit/06-open-questions.md Q2.

create or replace function public.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = org and m.user_id = auth.uid()
  );
$$;

create or replace function public.org_role(org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role from public.memberships m
  where m.org_id = org and m.user_id = auth.uid()
  limit 1;
$$;

-- Only authenticated users should call these from policies.
revoke execute on function public.is_org_member(uuid) from public;
revoke execute on function public.org_role(uuid) from public;
grant  execute on function public.is_org_member(uuid) to authenticated;
grant  execute on function public.org_role(uuid)     to authenticated;
