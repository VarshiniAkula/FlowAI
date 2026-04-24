# Audit 06 — Open questions (blocking Phase 1)

These are decisions or facts the spec, prompt pack, and Phase 0 prompt do not pin down. Phase 1 cannot start until each is answered.

---

## Q1. Existing Supabase project: fresh schema or coexist with legacy tables?

**Context.** The currently deployed Vercel app (`flowmind-nine-tau.vercel.app`) is wired to a Supabase project that contains two ad-hoc tables: `flowmind_published_assistants` and `flowmind_conversations`. Neither has `org_id`, neither matches the spec C schema, and both are anon-writable per the comment in `lib/supabase/server.ts`.

**Options.**
- **(a) Fresh project.** Create a new Supabase project for the multi-tenant schema; leave the legacy project for the demo URL until Phase 6 cuts over. Cleanest, but requires a new env var rotation and means the demo URL is unchanged-but-stale during Phases 1–5.
- **(b) Same project, parallel tables.** Add the spec C tables alongside the legacy `flowmind_*` tables in the same Supabase project. RLS on new tables is unaffected by the old ones. After Phase 6, drop the legacy tables.
- **(c) Same project, replace.** Migration `0001_init.sql` includes `DROP TABLE IF EXISTS flowmind_published_assistants, flowmind_conversations` at the top. Live demo breaks for the duration.

**Recommendation.** Option (b). Keeps the live demo working through Phases 1–5, decouples Phase 6's cutover from the schema rollout. Migration `0007_drop_legacy.sql` removes them at the end of Phase 6.

**Decision needed:** which option? Plus, **which Supabase project URL/keys go into `.env.example` and the team's local `.env`?** If a fresh project, please provision and share the URL.

---

## Q2. Bootstrapping the first owner membership

**Context.** Spec E says memberships are written only by owner/admin. Phase 2 task 4 says onboarding creates an org + the owner membership transactionally via the user-scoped client. With RLS on, the very first `memberships` insert for that org would have no existing owner to authorize it.

**Resolution path.** Add a SECURITY DEFINER SQL function `public.bootstrap_organization(p_name text, p_slug text)` invoked from the onboarding server action. It inserts both rows atomically with `created_by = auth.uid()` and `role = 'owner'`. The RLS policy then trusts the function's elevated privileges.

**Decision needed:** OK with this approach? Any preference for where the function lives (`0005_profiles_trigger.sql` vs a new `0006_bootstrap_org.sql`)?

---

## Q3. Member invitations: pending row vs Supabase magic link

**Context.** Phase 2 task 5: "Invite member by email — creates a `pending_invite` row OR sends a Supabase magic link — pick one and document".

**Trade-offs.**
- **Magic link.** No new table; Supabase emails the invitee a sign-in link with org context encoded in `redirectTo`. After they sign in, a server action checks the pending invite token and inserts the membership. Works only if the invitee can register (Supabase auth allows new accounts via magic-link flow).
- **Pending invites table.** Add `invitations(id, org_id, email, role, token, expires_at, created_by)`. Email is sent via a transactional provider (we don't have one wired). On sign-up, the post-auth callback joins on email and consumes the row.

**Recommendation.** Magic link for MVP. No transactional email provider needed; uses the Supabase auth email. Tradeoff: invite UX is "sign in to accept", not "click → land on org settings".

**Decision needed:** confirm magic link, or add an email provider and use the table approach?

---

## Q4. In-editor preview path during Phase 3 → Phase 5 transition

**Context.** `components/chat/hosted-chat.tsx` today supports two ids: `pub_*` (cloud) and anything-else (owner localStorage preview). After Phase 3 deletes `useAssistantStore`, the localStorage branch is broken. But the test chat endpoint (Phase 5) doesn't exist yet at the end of Phase 3.

**Options.**
- **(a) Delete preview at the end of Phase 3.** The Test tab in the editor breaks for one phase; users see an "Available in Phase 5" notice.
- **(b) Defer hosted-chat changes to Phase 5.** During Phase 3, hosted chat keeps reading `useAssistantStore`, which after Phase 3 is empty (no localStorage writes). The editor's Test tab becomes useless until Phase 5.

**Recommendation.** (a) — show a clear placeholder in the Test tab that says "Test chat is enabled in Phase 5; the runtime is being moved to a server endpoint with grounded retrieval and citations." Avoids confusion and broken UI.

**Decision needed:** confirm (a)?

---

## Q5. Vercel plan + ingestion timeout budget

**Context.** Spec section I says ingestion runs async via `waitUntil`. On Vercel:
- Hobby: function max 10s; `waitUntil` adds another ≤30s.
- Pro: function max 60s; `waitUntil` adds another ≤300s.

A 25 MB PDF can take >30s to extract+chunk+embed (especially the 100-batch embedding round-trips). On Hobby, ingestion would silently truncate.

**Decision needed:**
- (a) What plan is the production deploy on? (Memory says the deploy works; doesn't say which plan.)
- (b) Are we OK lowering the per-file size limit on Hobby to ~5 MB until upgrade, or do we require Pro for the MVP?
- (c) Alternative: kick the heavy lifting to a Supabase Edge Function instead of Vercel `waitUntil`. Adds complexity but unblocks Hobby.

---

## Q6. Custom domain or `vercel.app` for `NEXT_PUBLIC_APP_URL`?

**Context.** The hosted chat URL and embed snippet bake in `NEXT_PUBLIC_APP_URL`. If you publish today and tomorrow swap to a custom domain, every existing embed snippet on customer sites breaks.

**Decision needed:** what is the canonical production URL for embeds? Is `flowmind-nine-tau.vercel.app` the long-term URL, or should we hold off until a custom domain is available? Recommend: lock a domain (or commit to the vercel.app URL) before Phase 6.

---

## Q7. Profile fields beyond `email`

**Context.** Spec C says `profiles.full_name` and `profiles.avatar_url` come from `raw_user_meta_data` if present. Email/password signup doesn't capture these. Magic-link signup doesn't either.

**Decision needed:**
- (a) Leave nullable; user fills them out post-signup in a "Profile" page (not in spec).
- (b) Capture `full_name` on the signup form; leave `avatar_url` null.
- (c) Skip the profile UX entirely for MVP; rely on `email` only.

Recommendation: (b). One field on signup, no avatar upload UI.

---

## Once these are answered

Phase 1 can begin immediately. Open questions Q1, Q2, Q3, Q5 are blocking; Q4, Q6, Q7 are blocking only at the phase that needs them (Q4 → Phase 3; Q6 → Phase 6; Q7 → Phase 2). Please answer Q1/Q2/Q3/Q5 before we start writing migrations.
