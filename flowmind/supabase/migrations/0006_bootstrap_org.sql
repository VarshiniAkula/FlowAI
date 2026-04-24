-- Phase 1: bootstrap_organization() — the ONLY SECURITY DEFINER function in FlowMind.
-- Q2 resolution (docs/audit/06-open-questions.md). Lets a newly-authenticated
-- user atomically create an org AND their owner membership without needing a
-- permissive "authed user can insert memberships as owner" policy.

create or replace function public.bootstrap_organization(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  insert into organizations (name, slug, created_by)
    values (p_name, p_slug, auth.uid())
    returning id into new_org_id;

  insert into memberships (org_id, user_id, role)
    values (new_org_id, auth.uid(), 'owner');

  return new_org_id;
end;
$$;

revoke execute on function public.bootstrap_organization(text, text) from public;
grant  execute on function public.bootstrap_organization(text, text) to authenticated;
