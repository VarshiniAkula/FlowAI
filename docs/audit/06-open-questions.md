# Audit 06 — Open questions (status)

Tracking the seven Phase 0 questions and their resolutions. **Phase 1 is unblocked** (Q1, Q2, Q3, Q5 all answered).

---

## Q1. Supabase project — RESOLVED ✅

**Decision (2026-04-23):** Create a fresh Supabase project named `flowmind-dev`. Do **not** touch the existing Supabase project that powers the live demo. Project ID/URL/keys are stored in a local `.env.local` file that is gitignored — never committed.

**Implications.**
- Phase 1 migrations target the fresh project.
- The live demo at `flowmind-nine-tau.vercel.app` continues serving from the legacy Supabase project, untouched, throughout Phases 1–6.
- No `0007_drop_legacy.sql` migration is needed (the legacy tables aren't in our project).
- `.env.example` documents the variables; `.env.local` (gitignored) holds the actual fresh-project values.
- README "Local setup" must instruct: "create your own Supabase project at supabase.com, copy URL + keys into `flowmind/apps/web/.env.local`."

---

## Q2. Bootstrap of first owner membership — RESOLVED ✅

**Decision (2026-04-23):** Use `SECURITY DEFINER` for `bootstrap_organization()` — and **only** that function. Any future `SECURITY DEFINER` requires explicit approval.

**Function contract (binding for Phase 2):**
```sql
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
```

Lives in `supabase/migrations/0006_bootstrap_org.sql` (separate from the profiles trigger).

---

## Q3. Member invitations — RESOLVED ✅

**Decision (2026-04-23):** Use a `pending_invitations` table (named `invitations` in the schema). **No email sending in Phase 2** — the invite UI displays the invite URL for the admin to copy. Email send-site carries `TODO(phase-7): send invite email`.

**Schema (added to spec section C):**
```
invitations(
  id uuid pk,
  org_id uuid,
  email text,
  role text check (role in ('admin','member','viewer')),  -- NO 'owner'
  invited_by uuid,
  token text unique,                                       -- 32-char base62 from crypto.randomBytes
  expires_at timestamptz default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz default now()
)
-- partial unique: (org_id, email) where accepted_at is null
```

**Acceptance flow.** `/accept-invite?token=...` page validates `expires_at > now()` and `accepted_at IS NULL`, requires the user to sign in or sign up, inserts the membership for `(org_id, auth.uid(), role)`, sets `accepted_at = now()`.

**Owner is not invitable.** Owner role is granted only via the transfer-ownership flow.

---

## Q4. In-editor preview during Phase 3 → Phase 5 — DEFERRED (blocking Phase 3)

Recommendation in the original audit was: at the end of Phase 3, replace the editor's Test tab with a placeholder ("Test chat is enabled in Phase 5") until Phase 5 ships the authenticated `test-chat` endpoint.

**Status:** awaiting confirmation. Not blocking Phase 1 or Phase 2.

---

## Q5. Vercel timeout budget for ingestion — RESOLVED ✅

**Decision (2026-04-23):** Vercel Hobby plan. `waitUntil` (30s) is insufficient for 25 MB PDFs. Move heavy ingestion off Vercel into a Supabase Edge Function (`ingest-document`, Deno).

**Architecture (binding for Phase 4):**
- `POST /api/knowledge/ingest` (Next.js): validates auth + role, sets `documents.status = 'processing'`, invokes `ingest-document` via `supabase.functions.invoke()`, returns 202 in **under 1 second**.
- `supabase/functions/ingest-document/index.ts` (Deno): downloads from Storage, extracts, chunks, embeds, bulk-inserts, updates status. All heavy lifting lives here.

**Library choices for Deno (binding):**
- PDF: `pdfjs-dist` (WASM) — **not** `pdf-parse`.
- DOCX: `npm:mammoth`.
- HTML: `npm:node-html-parser` or `deno-dom`.
- Tokenizer: `npm:gpt-tokenizer`.
- Gemini: direct `fetch` to the REST API; no SDK.

**No duplicate logic.** `lib/ingest/process.ts` in the Next.js app is a thin invoker. Extraction/chunking/embedding code does not exist on the Next.js side. CI grep guard: those library names must NOT appear in `flowmind/apps/web/`.

**Local dev.** `supabase functions serve ingest-document --env-file ./supabase/.env.local`. Documented in README.

**Updated Phase 4 acceptance checks:**
- `/api/knowledge/ingest` returns 202 in < 1s regardless of file size.
- Edge Function logs show extraction/chunking/embedding completing.
- A 25 MB PDF reaches `status = 'ready'` within 3 minutes.

Spec section I and prompt pack Phase 4 have been rewritten to reflect this. See [docs/flowmind-spec.md](docs/flowmind-spec.md#i-knowledge-ingestion) and [docs/flowmind-prompt-pack.md](docs/flowmind-prompt-pack.md) Phase 4.

---

## Q6. Production URL for `NEXT_PUBLIC_APP_URL` — DEFERRED (blocking Phase 6)

Still open. Recommendation stands: lock a domain (custom or `vercel.app`) before Phase 6 so embed snippets don't break later.

---

## Q7. Profile fields beyond `email` — DEFERRED (blocking Phase 2)

Still open. Recommendation: capture `full_name` on the signup form, leave `avatar_url` null. Awaiting confirmation.

---

## Phase 1 readiness

| Question | Status |
|---|---|
| Q1 fresh Supabase project | ✅ |
| Q2 bootstrap function | ✅ |
| Q3 invitations | ✅ (consumed in Phase 2, not Phase 1, but schema lands in Phase 1 migration) |
| Q5 Edge Function ingestion | ✅ (consumed in Phase 4) |
| Q4 / Q6 / Q7 | Deferred — not blocking Phase 1 |

**Phase 1 can begin** once the fresh Supabase project is provisioned and `flowmind/apps/web/.env.local` is populated.
