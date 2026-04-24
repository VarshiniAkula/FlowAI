# FlowMind — Phased Prompt Pack for Claude Code

## How to use this

1. Save your original spec as `docs/flowmind-spec.md` in the repo root so every phase prompt can reference it.
2. Run the phases **in order**. Don't skip ahead. Each phase has explicit acceptance checks — don't start the next phase until they pass.
3. Start a fresh Claude Code session for each phase. Dumping all 8 phases into one context is how you get shallow work.
4. Copy the **Shared Preamble** block at the top of every phase prompt you paste.
5. After each phase, spot-check the diff yourself. Catch drift early.

---

## Decisions filled in (that your spec left open)

Your spec had several "pick one" ambiguities. I've picked specific values below. Change them now if you disagree — they're referenced throughout the phase prompts.

| Decision | Value | Why |
|---|---|---|
| Next.js paradigm | App Router, server actions + route handlers | Spec mentioned both; App Router supports both cleanly |
| Embedding model | Gemini `text-embedding-004` | 768-dim, free tier, matches Gemini stack |
| Vector column | `vector(768)` | Matches embedding model |
| Chat model | `gemini-2.5-flash` | Fast, cheap, good enough for RAG |
| Vector index | HNSW | Better recall than ivfflat at this scale |
| Chunk size | 1000 tokens target (~4000 chars) | Middle of your 800-1200 range |
| Chunk overlap | 150 tokens (~600 chars) | Middle of your 100-200 range |
| File size limit | 25 MB per file | Reasonable for text docs, stops abuse |
| File count limit | 100 files per assistant (MVP) | Keeps ingestion queue sane |
| PDF support | Yes, via `pdf-parse` | Common ask, library is safe |
| DOCX support | Yes, via `mammoth` | Common ask, library is safe |
| Crawling/URL ingestion | Out of scope for MVP | UI copy must reflect this |
| Auth library | `@supabase/ssr` | Current official helper |
| Validation | Zod on every server boundary | Already implied by spec |
| Ingestion mode | Async — upload returns immediately, processing happens in a background route handler, UI polls `document.status` | Vercel has request timeouts; PDFs will exceed them |
| Upload path | Client uploads directly to Supabase Storage using a **signed upload URL** issued by a server route | Avoids proxying large files through Next.js |
| Public chat session | Client generates a UUID `sessionId`, persists in widget-local storage for continuity (not source of truth) | Anonymous users need conversation threading |
| Rate limits | Public chat: 30 req/min per (IP + sessionId), 1000 req/day per published assistant | Prevents abuse of unauthenticated endpoint |
| CORS | Public chat endpoint + `/widget.js`: `*` origin. All other endpoints: same-origin only | Widget needs to work when embedded on third-party sites |
| Widget script | Single `/widget.js` file served from the Next.js app | Simpler than separate package for MVP |

### Role matrix

| Action | owner | admin | member | viewer |
|---|---|---|---|---|
| Delete organization | ✅ | ❌ | ❌ | ❌ |
| Invite / remove members | ✅ | ✅ (except owners) | ❌ | ❌ |
| Change member roles | ✅ | ✅ (cannot promote to owner) | ❌ | ❌ |
| Create / delete assistants | ✅ | ✅ | ✅ | ❌ |
| Edit assistant graph/settings | ✅ | ✅ | ✅ | ❌ |
| Upload / delete knowledge | ✅ | ✅ | ✅ | ❌ |
| Publish / unpublish | ✅ | ✅ | ✅ | ❌ |
| Read assistants, knowledge, analytics | ✅ | ✅ | ✅ | ✅ |
| Run test chat | ✅ | ✅ | ✅ | ✅ |

An organization must always have at least one owner. The user who creates an org is the owner. Only an owner can transfer ownership.

---

## Shared Preamble (paste at the top of every phase prompt)

```
You are working on FlowMind, a multi-tenant AI assistant platform. The full product spec is in `docs/flowmind-spec.md`. The phased execution plan is in `docs/flowmind-prompt-pack.md`. Read both before starting any phase.

Global rules:
- Stop and ask if you hit a decision not specified in the spec, the prompt pack, or this phase prompt. Do not guess on schema, auth, or security decisions.
- Commit after each numbered task within the phase. Message format: `phase-N: short description`.
- `SUPABASE_SERVICE_ROLE_KEY` must NEVER be importable from any file that can end up in the client bundle. Any file using it must start with `import 'server-only'`.
- All company-owned tables have `org_id` and RLS enabled and enforced.
- `localStorage` is for UI state only (draft autosave, selected org preference). It is never the source of truth for assistants, knowledge, conversations, or published state.
- Do not mark a phase complete until every acceptance check passes. If a previous phase's acceptance check regresses, stop and fix before proceeding.
- Do not leave mock/stub/TODO paths in production code flows. If something is dev-only, guard it with `process.env.NODE_ENV`.
- UI copy must match implemented reality. If a feature isn't implemented in the current phase, the UI must not advertise it.

Pinned tech choices (do not substitute without asking):
- Next.js 15 App Router, TypeScript strict mode, React Server Components where appropriate
- Supabase, `@supabase/ssr` for auth (not the deprecated auth-helpers)
- Postgres with pgvector, HNSW index
- Gemini `text-embedding-004` for embeddings (768 dimensions)
- Gemini `gemini-2.5-flash` for chat completions
- Zod for request validation on every server boundary
- `pdf-parse` for PDF text extraction
- `mammoth` for DOCX text extraction
- Chunk target: 1000 tokens with 150-token overlap
- File size limit: 25 MB per upload; max 100 files per assistant (MVP)

Role matrix and decisions-filled-in table are in `docs/flowmind-prompt-pack.md` — treat them as authoritative.
```

---

## Phase 0 — Audit + Plan (no code yet)

**Goal:** Produce an accurate picture of the current repo and a per-phase file-change plan before writing a line of production code.

**Prompt:**

```
[Shared Preamble]

This is Phase 0: Audit + Plan. Do NOT write application code in this phase. Output is documentation only.

Tasks:
1. Walk the repo and identify the active Next.js app directory. The active implementation may be inside a subfolder like `flowmind/apps/web`. Produce `docs/audit/01-repo-layout.md` listing every app/package with a one-line description of what it is and whether it's live, dead, or experimental.

2. Grep for every use of `localStorage`, `sessionStorage`, and `IndexedDB` across the active app. For each hit, record: file, line, what data is being stored, and whether it's authoritative (i.e., the app reads it back as source of truth) or ephemeral (UI state). Output `docs/audit/02-local-storage.md`.

3. Inventory the current Supabase usage (if any). What tables exist in migrations? What RLS policies? What client creation pattern (browser vs server vs service-role)? Output `docs/audit/03-supabase-current.md`.

4. Inventory current API routes, server actions, and any LLM-calling code. Note which are client-callable vs server-only, and whether any leak secrets. Output `docs/audit/04-api-surface.md`.

5. Read `docs/flowmind-spec.md` sections B-S and produce `docs/audit/05-gap-analysis.md`: a table mapping each spec requirement to "already exists / partially exists / missing" with a one-line note on the delta.

6. Produce `docs/plan/implementation-plan.md` with:
   - A file-change map per phase (which files get created, modified, deleted in each of Phases 1-7)
   - Explicit callouts where the current code will be removed or replaced
   - Any risks or unknowns you found during audit that the phase prompts don't address

7. List any questions or ambiguities you hit that aren't answered by the spec, the prompt pack, or this prompt. Put them in `docs/audit/06-open-questions.md`. STOP and wait for answers before starting Phase 1.

Acceptance checks:
- All six audit docs exist and are populated from real code, not assumptions.
- `docs/plan/implementation-plan.md` names specific files, not generic placeholders.
- `06-open-questions.md` is either empty (nothing unclear) or contains blocking questions that have been answered before Phase 1 begins.
- No changes to app code, only docs.
```

---

## Phase 1 — Foundation: Migrations, RLS, Auth Helpers, Type Gen

**Goal:** Database schema, row-level security, Supabase clients, and generated types. Nothing user-facing changes yet.

**Prompt:**

```
[Shared Preamble]

This is Phase 1: database foundation and server helpers. No UI changes in this phase — the dashboard can still look exactly like it does today. The goal is to get the database, RLS, and server-side plumbing right so every subsequent phase can assume they exist.

Tasks:

1. Set up Supabase locally. Create `supabase/` folder via `supabase init` if it doesn't exist. Add a `supabase/config.toml` that enables the `vector` extension. Add setup instructions to `README.md` under a new "Local Supabase" section.

2. Create migration `supabase/migrations/0001_init.sql` containing every table in spec section C, in dependency order. Use:
   - UUID primary keys with `gen_random_uuid()` default
   - `updated_at` columns where specified, with a shared trigger function `set_updated_at()`
   - Exact check constraints as written in the spec
   - `vector(768)` for `document_chunks.embedding`
   - `pg_trgm` extension if you use trigram indexes anywhere

3. Create migration `0002_indexes.sql`:
   - HNSW index on `document_chunks.embedding` using `vector_cosine_ops`
   - B-tree indexes on every `org_id`, `assistant_id`, `document_id`, `conversation_id`, `public_id`, `created_at` column that will be queried
   - Unique index on `published_assistants.public_id`
   - Unique index on `memberships(org_id, user_id)`

4. Create migration `0003_rls.sql`. Enable RLS on every table. Create a SQL helper function `public.is_org_member(org uuid)` that returns boolean based on the current `auth.uid()` having a row in `memberships`. Create `public.org_role(org uuid)` returning the user's role or null. Use these helpers inside policies rather than duplicating subqueries.

   Policy requirements (implement all of these — test them in Task 9):
   - `profiles`: users can select/update their own row only
   - `organizations`: select if member; insert by any authed user; update if role in ('owner','admin'); delete only by owner
   - `memberships`: select if user is a member of the same org; insert/update/delete only by owner or admin (admins cannot modify owners)
   - `assistants`: select if member; insert/update/delete if role in ('owner','admin','member')
   - `knowledge_sources`, `documents`, `document_chunks`: same as assistants
   - `published_assistants`: select if member; write if role in ('owner','admin','member')
   - `conversations`, `messages`: select if member; writes via service role only from server endpoints
   - `usage_events`: select if member; writes via service role only

   The anon key must NEVER be able to select from `documents`, `document_chunks`, `conversations`, `messages`, or `published_assistants` directly. Public access is strictly through server endpoints using the service role.

5. Create migration `0004_storage.sql` or a `supabase/seed.sql` entry that creates a private storage bucket named `knowledge-files` with `public = false`. Add RLS policies on `storage.objects` so only org members can read paths prefixed with `orgs/{their_org_id}/`.

6. Create `lib/supabase/server.ts` — a server-only helper that returns a Supabase client bound to the current user's cookies using `@supabase/ssr`. Add `import 'server-only'` at the top.

7. Create `lib/supabase/service.ts` — a server-only helper returning a service-role client. Add `import 'server-only'`. Export a function, not the client directly, so misuse is harder.

8. Create `lib/supabase/browser.ts` — browser client for auth flows only. Must use the anon key only.

9. Create `lib/auth/guards.ts` with shared helpers:
   - `requireUser()` — throws 401 if no session
   - `requireOrgMember(orgId)` — throws 403 if not a member
   - `requireOrgRole(orgId, minRole)` — checks role hierarchy owner > admin > member > viewer
   - `requireAssistantAccess(assistantId, minRole)` — resolves assistant's org, then delegates
   These helpers are the ONLY way server code checks authorization. Do not scatter role checks.

10. Add `npm run db:types` script that runs `supabase gen types typescript` into `lib/supabase/database.types.ts`. Run it and commit the output.

11. Write a verification script `scripts/verify-rls.ts` that:
    - Creates two test users in two orgs
    - Attempts cross-org reads/writes against every table
    - Asserts every cross-tenant access is denied
    - Asserts same-tenant access succeeds
    - Can be run with `npm run verify:rls`
   Document in the README how to run it.

12. Update `.env.example` with every required var from spec section A, with comments explaining each.

Acceptance checks:
- `supabase db reset` applies all migrations cleanly with no errors.
- `npm run db:types` produces a types file that compiles.
- `npm run verify:rls` passes — cross-tenant access is denied on every table.
- Searching the repo for `service_role` or `SERVICE_ROLE_KEY` imports returns matches only in files that start with `import 'server-only'`.
- No UI changes were made. The dashboard still renders as it did before Phase 1.

Non-goals for this phase:
- No auth UI changes yet (Phase 2).
- No assistant CRUD yet (Phase 3).
- No ingestion yet (Phase 4).
```

---

## Phase 2 — Auth Flows + Organization Model

**Goal:** Real login/signup/logout, org creation, membership, org switcher. Every authenticated page enforces membership.

**Prompt:**

```
[Shared Preamble]

This is Phase 2: Supabase Auth and organization UX. After this phase, a new user can sign up, create an org, and land on the dashboard — but assistants and knowledge are still stored as they were before (we replace those in Phases 3 and 4).

Tasks:

1. Create `/app/(auth)/login/page.tsx`, `/app/(auth)/signup/page.tsx`, and `/app/(auth)/logout/route.ts`. Use email+password auth via `@supabase/ssr`. Show clear error states. Redirect to `/onboarding` after signup, `/dashboard` after login.

2. Create middleware at `middleware.ts` that:
   - Refreshes the Supabase session on every request
   - Redirects unauthenticated users to `/login` for protected routes (`/dashboard`, `/builder`, `/knowledge`, `/deploy`, `/analytics`, `/assistants/*`, `/settings/*`)
   - Redirects authenticated users away from `/login` and `/signup`

3. Create an `on_auth_user_created` Postgres trigger (migration `0005_profiles_trigger.sql`) that inserts a row into `profiles` when a new `auth.users` row appears. Email is copied; full_name and avatar_url come from `raw_user_meta_data` if present.

4. Create `/app/onboarding/page.tsx` for post-signup org creation. If the user already has memberships, redirect to `/dashboard`. On submit, create an organization AND the owner membership in a single transaction via a server action. The server action must use the user-scoped client (not service role) so RLS is exercised; adjust RLS on `organizations` insert if needed to allow authed users to create their own org.

5. Create `/app/(app)/settings/organization/page.tsx`:
   - Org details (name, slug) — editable by owner/admin
   - Members list with role
   - Invite member by email (MVP: creates a pending_invite row OR sends a Supabase magic link — pick one and document in the README)
   - Change member role (respecting the role matrix in the prompt pack)
   - Remove member
   - Transfer ownership (owner only, with confirmation)

6. Create an org switcher component in the main app layout header:
   - Lists every org the user is a member of
   - Persists selected org ID in a cookie named `flowmind-active-org` (not localStorage — cookies are readable server-side)
   - On every server render, validate the cookie matches a real membership before trusting it; if invalid, fall back to the first membership

7. Create a server helper `getActiveOrg()` in `lib/auth/active-org.ts` that reads the cookie, validates membership, and returns `{ org, role }` or null.

8. Update `/app/(app)/layout.tsx` to:
   - Require authenticated user
   - Require active org (redirect to `/onboarding` if user has no orgs)
   - Pass active org context to children via a server component or context provider

9. Add `lib/auth/guards.ts` tests (or extend the Phase 1 verify script):
   - Unauthenticated request to a protected route → redirects to /login
   - Authenticated user without membership on org X → `requireOrgMember('X')` throws 403
   - Viewer attempting a member-only action → throws 403

10. Update the README with a "Creating your first account" section walking through signup → onboarding → dashboard.

Acceptance checks:
- A brand-new email can sign up, land on onboarding, create an org, and reach `/dashboard`.
- Logging out and hitting `/dashboard` redirects to `/login`.
- Creating a second org and switching between them works; the header reflects the current org.
- Attempting to navigate to an org-scoped URL for an org the user doesn't belong to returns a 403 or redirect (not a silent wrong-org render).
- Removing a member immediately revokes their access on next request.
- `profiles` has a row for every signed-up user (trigger works).
- RLS verify script from Phase 1 still passes.

Non-goals:
- No billing, no plan limits, no SSO. MVP only.
- No localStorage replacement for assistants yet.
```

---

## Phase 3 — Assistant Persistence + Builder Wiring

**Goal:** Kill localStorage as the source of truth for assistants. Dashboard and builder read/write to Supabase.

**Prompt:**

```
[Shared Preamble]

This is Phase 3: move assistants from localStorage to the database. Refer to `docs/audit/02-local-storage.md` for the exact localStorage keys that need to be replaced.

Tasks:

1. Create `lib/db/assistants.ts` with typed CRUD using the user-scoped Supabase client:
   - `listAssistants(orgId)` → returns rows scoped to the active org
   - `getAssistant(id)` → returns one row; throws if not found or not in a visible org
   - `createAssistant({ orgId, name, description, graph?, settings? })`
   - `updateAssistant(id, patch)` — partial update; validates role via `requireAssistantAccess(id, 'member')`
   - `deleteAssistant(id)`
   - `duplicateAssistantFromTemplate(orgId, templateKey)` — seeds a new row from a hardcoded template
   All functions validate org membership and role using the Phase 1 guards.

2. Create server actions in `/app/(app)/assistants/actions.ts` wrapping the CRUD functions. Validate inputs with Zod.

3. Update the dashboard page (`/app/(app)/dashboard/page.tsx` or wherever the assistant list currently lives) to render from `listAssistants(activeOrg.id)` as a server component. Remove all localStorage reads related to assistants.

4. Update the builder page to:
   - Load the assistant from the database on mount (server component fetches, passes to client builder)
   - Save graph/settings changes via the update server action. Debounce to ~1 save per 2 seconds to avoid hammering the DB.
   - Show a "Saved" / "Saving..." / "Unsaved changes" indicator.
   - Keep a local autosave draft in sessionStorage (NOT localStorage, NOT authoritative) so a tab crash doesn't lose the in-flight edit. On reload, prompt the user to restore the draft or discard.

5. Template handling: the current app has templates like "Customer Support," "Sales Assistant," etc. Move template definitions to `lib/templates/index.ts` as plain data (not DB rows). "Use template" calls `duplicateAssistantFromTemplate` which inserts a new assistant with the template's default graph + settings.

6. Delete/archive flow: soft-delete is out of scope for MVP — a hard delete with cascading `document_chunks` removal is fine. Show a confirmation dialog listing what will be destroyed (knowledge files, conversations, published URLs).

7. If Phase 0's audit found existing localStorage assistant data, add a one-time migration button on the dashboard: "Import local assistants." It reads localStorage, shows a preview, and on confirm calls a server action that inserts them into the active org. After successful import, clear the relevant localStorage keys and show a toast: "Imported. localStorage is no longer used for assistant state."

8. Remove or rewrite every other localStorage write path related to assistants. Leave a grep-able comment on any intentionally-kept localStorage use: `// localStorage: UI-only, never source of truth`.

9. Add integration tests (or extend the verify script) for:
   - Create assistant → appears in `listAssistants` for same org
   - Create assistant → does NOT appear in `listAssistants` for a different org
   - Viewer cannot create/update/delete
   - Member can create/update/delete their org's assistants
   - Update on a non-existent or cross-org assistant throws 404/403

Acceptance checks:
- Creating an assistant in browser A, then opening browser B (same user), shows the assistant without any localStorage import.
- Searching the repo for `localStorage` in files related to assistants returns zero authoritative-write hits (only UI-state comments remain).
- Dashboard and builder work end-to-end across browsers and after cache clear.
- Deleting an assistant removes it for all users in the org.
- A member from another org cannot read or modify assistants they don't belong to (verify via script).

Non-goals:
- No knowledge upload yet (Phase 4).
- No test chat yet (Phase 5).
- No publishing yet (Phase 6).
```

---

## Phase 4 — Knowledge Ingestion (Upload → Chunks → Embeddings)

**Goal:** User uploads a file; minutes later it's fully ingested in `document_chunks` with embeddings, scoped to one assistant in one org.

**Prompt:**

```
[Shared Preamble]

This is Phase 4: end-to-end knowledge ingestion. This is the longest phase — be disciplined about committing after each task. Do not skip Task 8 (testing) — broken ingestion is the highest-risk failure mode in this product.

Tasks:

1. Create the signed upload flow. Server route `POST /api/knowledge/upload-url`:
   - Validates auth, org membership, role >= member, target `assistantId`
   - Validates filename extension against allowlist: `.txt`, `.md`, `.csv`, `.html`, `.pdf`, `.docx`
   - Validates size in the request body (client sends `sizeBytes`); rejects > 25 MB
   - Enforces per-assistant file count ceiling (100 files); reject if already at the limit
   - Generates a storage path: `orgs/{orgId}/assistants/{assistantId}/documents/{newDocumentId}/{sanitizedFilename}`
   - Inserts a `documents` row with status `pending` and a matching `knowledge_sources` row with type `file`
   - Returns a signed upload URL, the `documentId`, and the storage path

2. Client upload: the knowledge manager UI calls the upload-url route, then PUTs the file directly to Supabase Storage using the signed URL, then calls `POST /api/knowledge/ingest` with the `documentId` to kick off processing. Show progress and never write file contents to localStorage.

3. Server route `POST /api/knowledge/ingest`:
   - Validates auth + org + role
   - Loads the `documents` row; rejects if already in `processing` or `ready`
   - Sets `status = 'processing'`
   - Returns 202 Accepted immediately
   - Triggers the ingestion pipeline via `waitUntil(processDocument(documentId))` (if on Vercel) or via a direct async call with proper error isolation. Document the execution model clearly in code comments — this is a common place to accidentally block the request.

4. Build the extraction pipeline `lib/ingest/extract.ts`:
   - Downloads the file via the service-role client from private storage
   - Dispatches by MIME/extension:
     - `.txt`, `.md` — raw UTF-8 read
     - `.html` — strip tags, keep text (use `node-html-parser` or similar; preserve headings as line breaks)
     - `.csv` — read as text; join rows with newlines; include header row
     - `.pdf` — `pdf-parse`; capture page boundaries in metadata
     - `.docx` — `mammoth.extractRawText`
   - Returns `{ text: string, pages?: Array<{ page: number; text: string }> }`
   - On failure: sets `documents.status = 'failed'` with a user-readable error message and re-throws

5. Build the chunker `lib/ingest/chunk.ts`:
   - Normalizes whitespace (collapse runs of whitespace, trim)
   - Targets ~1000 tokens per chunk with ~150 token overlap — use a token counter like `tiktoken` or `gpt-tokenizer` (Gemini tokens aren't publicly counted; approximate via characters: 1 token ≈ 4 chars → ~4000 chars per chunk, ~600 char overlap)
   - Tries to break on paragraph or sentence boundaries
   - Preserves metadata per chunk: `{ documentId, filename, sourceType, pageNumber?, chunkIndex }`
   - Skips chunks under 50 chars (likely junk)

6. Build the embedder `lib/ingest/embed.ts`:
   - Calls Gemini `text-embedding-004` with `taskType: RETRIEVAL_DOCUMENT` for ingestion
   - Batches up to 100 chunks per request to respect API limits
   - Retries with exponential backoff on 429/5xx
   - Returns `number[][]` of 768-dim vectors in input order
   - If `GEMINI_API_KEY` is missing: fails loudly, does not silently skip

7. Wire the pipeline `lib/ingest/process.ts` → `processDocument(documentId)`:
   - extract → chunk → embed → insert `document_chunks` rows with `org_id`, `assistant_id`, `document_id`, `chunk_index`, `content`, `token_count`, `embedding`, `metadata`
   - Use a single bulk insert (or batches of 100) via the service-role client
   - On success: `documents.status = 'ready'`, `knowledge_sources.status = 'ready'`
   - On failure at any stage: mark both as `failed` with the error message; do not leave orphan chunks (wrap in a cleanup)
   - Emits a `usage_events` row: `event_type = 'document_ingested'`, metadata includes chunk count + total tokens

8. Verification tests (add to `scripts/verify-ingest.ts`):
   - Upload a sample .md file (check in a fixture) → ingestion completes → `document_chunks` rows exist with embeddings → dimensions == 768
   - Upload the SAME file to a different org's assistant → chunks are isolated (query with org A's client cannot see org B's chunks)
   - Upload an unsupported file type → rejected at upload-url step
   - Upload a 30 MB file → rejected for size
   - Corrupt file / empty file → `status = 'failed'` with clear error
   - Upload 101 files → the 101st is rejected with a clear error

9. Knowledge manager UI updates:
   - Replace the existing localStorage-backed knowledge list with a server-component list from `documents` for the current assistant
   - Show status badges: pending / processing / ready / failed (with error on hover)
   - Poll every 3 seconds while any document is in `pending` or `processing` state
   - Delete button → server action that removes chunks, document row, and storage file
   - Update copy: only claim the file types actually supported (.txt, .md, .csv, .html, .pdf, .docx). Remove "website crawling" if it's in the current UI.

10. Update `.env.example` and README with GEMINI_API_KEY setup instructions and a note about embedding dimensions being tied to the DB schema.

Acceptance checks:
- A 5-page PDF uploads, processes, and shows `ready` within 60 seconds on local dev.
- Ingested chunks have 768-dim embeddings in `document_chunks`.
- Cross-org isolation verified by `verify-ingest.ts`.
- Unsupported file types, oversized files, and corrupt files all fail with user-visible errors.
- No file content is ever written to localStorage.
- The signed upload URL works from the browser without the service role key ever touching the client.

Non-goals:
- No retrieval yet (Phase 5).
- No reranking or hybrid search yet.
- No URL/website ingestion (stays out-of-scope for MVP).
```

---

## Phase 5 — Retrieval + Builder Test Chat

**Goal:** Given an ingested assistant, the builder's test chat returns grounded answers with citations. Server-side retrieval only.

**Prompt:**

```
[Shared Preamble]

This is Phase 5: retrieval function and authenticated test-chat endpoint. After this phase, a logged-in builder can chat with their assistant and get cited answers — but nothing is publicly accessible yet (that's Phase 6).

Tasks:

1. Create `lib/retrieval/retrieve.ts` exporting:
   ```
   retrieveRelevantChunks({
     orgId: string,
     assistantId: string,
     query: string,
     topK?: number  // default 8
   }): Promise<Array<{
     chunkId: string,
     documentId: string,
     documentName: string,
     chunkIndex: number,
     content: string,
     similarity: number,
     metadata: Record<string, unknown>
   }>>
   ```
   Implementation:
   - Embed the query with Gemini `text-embedding-004`, `taskType: RETRIEVAL_QUERY`
   - Use a Postgres function `match_document_chunks(p_org_id uuid, p_assistant_id uuid, p_query_embedding vector(768), p_match_count int)` that does the cosine similarity search server-side and joins `documents` for `documentName`. Create this as migration `0006_match_function.sql`.
   - NEVER pass a user-supplied orgId — resolve it server-side from the assistant or published_assistant.
   - Use the service-role client ONLY inside this helper (it's trusted infrastructure), but never expose the raw matches to a caller that hasn't passed an auth check.

2. Create the builder test-chat endpoint `POST /api/assistants/[assistantId]/test-chat`:
   - Validates auth + `requireAssistantAccess(assistantId, 'viewer')` (viewers can test)
   - Resolves `orgId` from the assistant row
   - Validates request body with Zod: `{ message: string, sessionId?: string }`
   - Creates or continues a `conversations` row with `channel = 'test'` and a metadata flag `isTest: true`
   - Stores the user message
   - Calls `retrieveRelevantChunks` with `topK = 8`
   - Builds a grounded prompt (see Task 3)
   - Calls Gemini `gemini-2.5-flash`
   - Parses citations from the response and stores the assistant message with a `citations` array
   - Returns `{ answer, citations, conversationId }`

3. Create `lib/llm/prompt.ts` with the grounded prompt template. Centralize all prompts here — no ad-hoc prompt strings elsewhere:
   ```
   System: You are {assistant.name}, a helpful assistant for {org.name}.
   {assistant.settings.systemPrompt or default tone instructions}
   
   You must answer using ONLY the context provided below. If the answer is
   not in the context, say: "I don't have enough information in the knowledge
   base to answer that." Do not invent prices, policies, legal claims, or
   commitments. Cite sources using the format [doc:{chunkIndex}] inline.
   
   Context:
   [1] (from {doc1.name}, chunk {doc1.chunkIndex})
   {doc1.content}
   
   [2] (from {doc2.name}, chunk {doc2.chunkIndex})
   {doc2.content}
   
   ...
   
   User question: {query}
   ```
   Implement a citation parser that extracts `[doc:N]` references from the model output, maps N back to the corresponding chunk, and returns a clean `citations` array. Strip the markers from the user-facing `answer` text, or keep them as clickable footnotes — pick one and be consistent.

4. Create `lib/llm/gemini.ts` with a single `generateAnswer({ systemPrompt, userMessage, context })` function. Include:
   - Request timeout (30 seconds)
   - Retry on 429/5xx with exponential backoff (max 3 retries)
   - Token budget tracking in logs
   - Safe handling of safety-block responses (return a clear message, don't crash)

5. Update the builder UI test chat panel:
   - Calls the new endpoint instead of any in-browser LLM call
   - Shows citations as chips below each assistant message; clicking a chip opens a side panel with the chunk's full content and source document name
   - Shows a loading state with the message "Searching knowledge..." then "Generating..."
   - Handles the "not enough information" response with a distinct visual style so users notice

6. Add "no knowledge" handling: if `retrieveRelevantChunks` returns an empty array, skip the LLM call and return a canned "I don't have any knowledge in this assistant yet — upload some files first." response. Log a `usage_events` row with `event_type = 'empty_retrieval'`.

7. Add a `usage_events` row for every test-chat turn with `event_type = 'test_message'` and metadata including retrieval count, citation count, whether the assistant said "not enough information."

8. Verification (extend `verify-ingest.ts` or add `verify-retrieval.ts`):
   - Ingest a small known document, e.g., a fact: "The company's return policy is 30 days." Ask the test chat a matching question. Assert the answer contains "30 days" and at least one citation pointing to the ingested document.
   - Ask a question NOT covered by the docs. Assert the response is the "not enough information" canned answer.
   - Confirm another org's ingested fact does NOT bleed into the first assistant's answers.

Acceptance checks:
- Test chat returns grounded answers with citations on ingested content.
- Test chat returns the "not enough information" response when unrelated.
- Cross-org retrieval isolation holds under the verification script.
- The `citations` field in the `messages` row contains structured data, not a stringified dump.
- All Gemini calls flow through `lib/llm/gemini.ts` — no duplicate SDK initializations elsewhere.
- Viewers can use test chat; the Phase 1 RLS verify script still passes.

Non-goals:
- No public chat endpoint yet (Phase 6).
- No reranking / hybrid search — pure vector similarity is fine for MVP.
- No streaming responses — keep it non-streaming for simplicity.
```

---

## Phase 6 — Publish + Public Chat + Embeddable Widget

**Goal:** End-to-end publish. A third party can load a widget on any site and chat with the assistant using the same knowledge base.

**Prompt:**

```
[Shared Preamble]

This is Phase 6: publishing and public runtime. After this phase, the acceptance criteria in spec section S are fully satisfied except analytics and copy cleanup (those are Phase 7).

Tasks:

1. Create `lib/publish/public-id.ts` that generates `pub_<32-char-base62>` IDs via `crypto.randomBytes`. Must be unguessable. Add a unit test verifying uniqueness across 10k generations.

2. Server action `publishAssistant(assistantId)`:
   - Validates auth + role >= member
   - Snapshots the current `assistants.graph` and `assistants.settings` into a new `published_assistants` row
   - If a previous published version exists for this assistant, increments `version`; otherwise `version = 1`
   - Sets `status = 'published'`, `visibility = 'public'`
   - Returns `{ publicId, hostedUrl, embedCode, version }`

3. Server action `unpublishAssistant(publishedAssistantId)`:
   - Validates auth + role >= member
   - Sets `status = 'disabled'`
   - Does NOT delete the row (so analytics/history survive)

4. Server action `republishAssistant(assistantId)` — thin wrapper that's equivalent to `publishAssistant` since we already version on each publish.

5. Public chat endpoint `POST /api/chat/[publicId]`:
   - No Supabase auth
   - CORS: `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: POST, OPTIONS`, handle the preflight
   - Rate limit: 30 requests/minute per (IP + sessionId) and 1000 requests/day per publicId. Use an in-memory/DB rate limiter for MVP — document the trade-off and leave a TODO for Upstash/Redis later.
   - Validates body with Zod: `{ message: string (1-4000 chars), sessionId: string (uuid) }`
   - Looks up `published_assistants` by `public_id` where `status = 'published'`
   - If not found or disabled: returns 404 with `{ error: "Assistant not available." }`
   - Resolves `orgId` and `assistantId` from the published row (NEVER trust client)
   - Creates or continues a `conversations` row with `channel = 'web'`, `published_assistant_id = <row.id>`, `session_id` from the body
   - Stores the user message
   - Calls `retrieveRelevantChunks` (identical function as Phase 5) with the published assistant's `assistantId`
   - Builds the same grounded prompt as test chat, but uses the SNAPSHOT settings from `published_assistants.settings_snapshot`, not the live assistant
   - Calls Gemini
   - Stores assistant message with citations
   - Emits `usage_events`: `event_type = 'public_message'`, metadata includes retrieval count, citation count, "not enough information" flag
   - Returns `{ answer, citations, conversationId }`

6. Public chat page `/chat/[publicId]/page.tsx`:
   - Server component that only fetches the assistant's name, tone, and published status for initial render (no graph, no chunks)
   - Renders a chat UI that calls `/api/chat/[publicId]`
   - Generates and persists a `sessionId` in `sessionStorage` (widget-local, not authoritative)
   - Shows "This assistant is not available" if the server component can't find a published row
   - No "built with FlowMind" badge requirement for MVP (add later)

7. Embeddable widget at `/widget.js` (served as a Next.js route handler at `/app/widget.js/route.ts` with `Content-Type: application/javascript`):
   - Self-contained JS (bundle any deps)
   - Reads `data-flowmind-id` from its own script tag
   - Injects a floating chat button + iframe pointing at `/chat/[publicId]?embed=1`
   - The `?embed=1` version of the chat page strips the header/footer and makes itself iframe-friendly (no X-Frame-Options restrictions; allow framing from anywhere)
   - Minimal styling — a single button in the bottom-right corner. Don't over-engineer.

8. Deploy panel UI at `/app/(app)/assistants/[id]/deploy/page.tsx`:
   - Shows current publish state (published / disabled / never published)
   - "Publish" / "Republish" button
   - "Disable" button (shows a confirmation: "The public chat will stop working immediately")
   - Copyable hosted URL
   - Copyable embed snippet: `<script src="{NEXT_PUBLIC_APP_URL}/widget.js" data-flowmind-id="{publicId}" async></script>`
   - Version history (read-only list of prior `published_assistants` rows with created_at)

9. Verification (add to `scripts/verify-publish.ts`):
   - Publish an assistant → hosted URL returns the chat page
   - Send a message to `/api/chat/[publicId]` → receive a grounded answer with citations
   - Open the hosted chat in an incognito window → still works (confirms server-side retrieval, not localStorage)
   - Disable the assistant → `/api/chat/[publicId]` returns 404 / "not available"
   - Cross-org: org B's user cannot read org A's `published_assistants` via direct Supabase client calls (verify via the anon key)
   - Rate limit: hammer the endpoint with 50 requests in 10 seconds → later ones are rejected with 429

Acceptance checks:
- Spec section S acceptance criteria 9, 10, 11 all pass: publish, public chat works, different-browser test works.
- Criterion 12 holds: no cross-org leakage at any layer.
- Disabling an assistant stops public chat within one request (no caching that keeps it alive).
- The widget loads on a plain HTML page (test with `<script>` tag on a file:// URL or a scratch site) and produces a working chat button.
- `SUPABASE_SERVICE_ROLE_KEY` does not appear in any bundle file — verify with a grep on `.next/`.

Non-goals:
- No SSO or domain restrictions on published assistants yet (that's a paid feature).
- No streaming responses.
- No theming of the public chat beyond what's already in `assistants.settings`.
```

---

## Phase 7 — Analytics, Error Handling, Copy Cleanup, Migration Tool

**Goal:** Polish pass. Everything the spec calls out that's not in Phases 1-6 gets handled here.

**Prompt:**

```
[Shared Preamble]

This is Phase 7: polish. No new core features. We're making the platform defensible for real customers.

Tasks:

1. Analytics page `/app/(app)/analytics/page.tsx` (per assistant, scoped to active org):
   - Conversation count (last 7d, 30d, all time)
   - Message count (user vs assistant)
   - Last active timestamp
   - Failed-answer rate (fraction of assistant messages where metadata flagged "not enough information")
   - Top 10 user questions by frequency (use a simple lowercase-normalized group-by for MVP)
   - Citation usage (fraction of answers with at least one citation)
   - All queries against `conversations`, `messages`, and `usage_events` tables — never computed client-side from full dumps.
   - All queries filtered by `org_id` and `assistant_id`.

2. Replace any remaining fake/local analytics with real DB queries. Audit for leftover mock data.

3. Error handling pass. Every server route and server action should return clear error shapes:
   ```
   { error: { code: string, message: string } }
   ```
   Implement these explicit codes: `UNAUTHENTICATED`, `NOT_A_MEMBER`, `INSUFFICIENT_ROLE`, `NOT_FOUND`, `UNSUPPORTED_FILE_TYPE`, `FILE_TOO_LARGE`, `FILE_LIMIT_REACHED`, `EXTRACTION_FAILED`, `EMBEDDING_FAILED`, `LLM_KEY_MISSING`, `NO_KNOWLEDGE`, `ASSISTANT_DISABLED`, `RATE_LIMITED`. Surface them in the UI with human-friendly messages.

4. Copy cleanup. Grep the app for feature claims and verify against reality:
   - Landing page / marketing copy
   - Empty states
   - Tooltips
   - Template descriptions
   - Onboarding copy
   Remove or rewrite any claims about unsupported features (website crawling, PDF OCR if using `pdf-parse` which doesn't OCR, etc.). Produce a `docs/copy-audit.md` listing every claim changed and why.

5. One-time localStorage migration tool (if not already covered in Phase 3). Self-check: does any user-hostile localStorage data still exist from pre-SaaS versions? If yes, add a `Settings → Import legacy data` flow that:
   - Detects the keys
   - Shows a preview
   - Imports on confirm
   - Clears the keys after successful import
   If no legacy data exists, skip this task but document that in `docs/copy-audit.md`.

6. README final pass. The README must contain:
   - "What FlowMind is" (one paragraph)
   - "Local setup" — env vars, Supabase CLI commands, `npm run db:reset`, seed
   - "End-to-end test flow" — signup → create org → create assistant → upload .md → publish → hit public chat
   - "Running verification scripts" — `verify:rls`, `verify:ingest`, `verify:retrieval`, `verify:publish`
   - "Deploying to Vercel" — env var checklist, Supabase production setup, storage bucket setup
   - "Supported file types" — only what's actually supported
   - "Known limitations" — no streaming, no SSO, rate limit is in-memory for MVP, etc.

7. Produce `docs/implementation-summary.md`: a final deliverable per spec section T, item 13:
   - Complete list of changed files grouped by phase
   - Each acceptance criterion from spec section S mapped to where it's satisfied (file paths + function names)
   - Any deliberate deviations from the spec with a one-line justification
   - Known gaps or follow-up items

8. Final cross-tenant security sweep. Run:
   - `npm run verify:rls`
   - `npm run verify:ingest`
   - `npm run verify:retrieval`
   - `npm run verify:publish`
   All must pass. Additionally, pick two browsers logged in as different users from different orgs, and manually verify you cannot see each other's assistants, files, conversations, or analytics at any URL.

9. Search the built output for secrets. Run `npm run build`, then grep `.next/` for `service_role`, the actual service role key value, and any other sensitive strings from `.env`. Zero hits required.

Acceptance checks:
- Every spec section S acceptance criterion is satisfied. Cite the file + function for each one in `implementation-summary.md`.
- No unsupported feature is claimed anywhere in the UI.
- All four verify scripts pass.
- No secrets in the built client bundle.
- Analytics page shows real data derived from DB queries.

Non-goals:
- No new user-facing features.
- No performance optimization beyond what the verify scripts exercise.
```

---

## After all phases — final human review

Don't ship without doing these yourself, not via Claude Code:

1. **Read the RLS migration end-to-end.** RLS bugs don't throw — they silently let cross-tenant reads through. Eyes on the SQL.
2. **Test with two real browsers logged in as two real users in two different orgs.** Try every URL you can think of to access the other org's data.
3. **Inspect the production bundle** (`npm run build` then `grep -r "service_role\|sbp_\|sk_" .next/`) — should be empty.
4. **Turn off the service role key and try the public chat** — if it works, your public endpoint is leaking. It should break for the authenticated endpoints but may or may not for the public one depending on how you implemented it; you want to understand why.
5. **Upload a malicious filename** (`../../evil.txt`, a file with null bytes, a 0-byte file, a file with a fake extension like `evil.pdf.exe`). Ingestion should reject or sanitize.
6. **Rate-limit check against a real pounding** — `hey -n 500 -c 20 https://your-app/api/chat/<publicId>` and confirm the rate limiter actually bites.
