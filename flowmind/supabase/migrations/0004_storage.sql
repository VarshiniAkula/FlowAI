-- Phase 1: private storage bucket for knowledge files + RLS on storage.objects.
-- Files live at `orgs/{org_id}/assistants/{assistant_id}/documents/{document_id}/{filename}`.

insert into storage.buckets (id, name, public)
values ('knowledge-files', 'knowledge-files', false)
on conflict (id) do nothing;

-- Only org members may read their own org's prefix.
-- Path shape: orgs/<org_id>/... so we split on '/' and look at position 2.
create policy "knowledge_files_member_select"
on storage.objects for select
using (
  bucket_id = 'knowledge-files'
  and (storage.foldername(name))[1] = 'orgs'
  and public.is_org_member( ((storage.foldername(name))[2])::uuid )
);

-- Writes on the bucket go through server endpoints with the service role
-- (signed upload URLs are issued server-side). No client-facing insert /
-- update / delete policy is created here — the default-deny posture stands.

-- An explicit deny-on-wrong-bucket policy isn't needed: with RLS on and no
-- matching policy for other buckets, access is denied by default.
