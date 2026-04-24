# Audit 05 — Gap analysis vs spec sections B–S

Each row maps a spec requirement to its current implementation status: **Exists** / **Partial** / **Missing**.

## B. Supabase Auth

| # | Requirement | Status | Note |
|---|---|---|---|
| B1 | Login/signup/logout via `@supabase/ssr` | Missing | No `@supabase/ssr` dependency, no auth pages. |
| B2 | Middleware protecting `/dashboard`, `/builder`, `/knowledge`, `/deploy`, `/analytics`, `/assistants/*`, `/settings/*` | Missing | No `middleware.ts`. |
| B3 | Redirect unauthed → `/login` | Missing | No auth boundary at all. |
| B4 | Post-signup → `/onboarding` | Missing | Route does not exist. |
| B5 | `profiles` table populated by `on_auth_user_created` trigger | Missing | Trigger and table absent. |

## C. Database schema

Spec section C names 10 tables. Today the DB has 2 ad-hoc tables (`flowmind_published_assistants`, `flowmind_conversations`) — **none of the 10 spec tables exist**.

| Table | Status | Note |
|---|---|---|
| `profiles` | Missing | — |
| `organizations` | Missing | — |
| `memberships` | Missing | — |
| `assistants` | Missing | Currently lives in `localStorage:flowmind-assistants`. |
| `knowledge_sources` | Missing | Implicit in `localStorage:flowmind-knowledge.documents[]`. |
| `documents` | Missing | Same. |
| `document_chunks` | Missing | Implicit in `localStorage:flowmind-knowledge.chunks[]`. No embeddings (BM25 only). |
| `published_assistants` | Partial (wrong shape) | `flowmind_published_assistants` exists with `id, assistant_id, name, description, graph, version, published_at`. Lacks `org_id`, `public_id` (id IS the public id today), `graph_snapshot/settings_snapshot`, `status`, `visibility`, `created_by`. Will be replaced. |
| `conversations` | Partial (wrong shape) | `flowmind_conversations` lacks `org_id`, `published_assistant_id` (uses `publish_id`), `session_id`, `user_id`, `channel`. |
| `messages` | Missing | Conversations track only `turn_count`; no per-message rows. |
| `usage_events` | Missing | — |

## D. Extensions, indexes, triggers

| # | Requirement | Status |
|---|---|---|
| D1 | `vector` extension | Missing |
| D2 | `pgcrypto` extension | Unknown (not declared in repo; Supabase enables by default) |
| D3 | HNSW index on `document_chunks.embedding` | Missing |
| D4 | B-tree on every `org_id`, `assistant_id`, `document_id`, `conversation_id`, `public_id`, `created_at` | Missing |
| D5 | Unique on `published_assistants.public_id` | Unknown (table exists but no SQL in repo) |
| D6 | Unique on `memberships(org_id, user_id)` | Missing (no table) |
| D7 | Shared `set_updated_at()` trigger | Missing |

## E. Row Level Security

| # | Requirement | Status |
|---|---|---|
| E1 | RLS enabled on every table | Missing — comment in `lib/supabase/server.ts` says current table is anon-writable. |
| E2 | `is_org_member(org uuid)` helper | Missing |
| E3 | `org_role(org uuid)` helper | Missing |
| E4 | Per-table policies (orgs/memberships/assistants/...) | Missing |
| E5 | Anon cannot read `documents`/`document_chunks`/`conversations`/`messages`/`published_assistants` | **Violated** — anon can read `flowmind_published_assistants` and `flowmind_conversations` today. |

## F. Storage

| # | Requirement | Status |
|---|---|---|
| F1 | Private `knowledge-files` bucket | Missing |
| F2 | Path layout `orgs/{org_id}/assistants/{assistant_id}/documents/{document_id}/{filename}` | Missing |
| F3 | Signed upload URL via server route | Missing — uploads currently go through `/api/parse-document` which never persists files. |
| F4 | RLS on `storage.objects` for `orgs/{their_org_id}/` | Missing |

## G. Assistant persistence

| # | Requirement | Status |
|---|---|---|
| G1-6 | DB-backed CRUD + duplicate-from-template | Missing — all CRUD lives in [stores/assistant-store.ts](flowmind/apps/web/stores/assistant-store.ts). |
| G7 | Debounced server save (~1/2s) | Missing — saves are synchronous to localStorage. |
| G8 | DB is source of truth | **Violated** — localStorage is. |
| G9 | Templates as plain data in `lib/templates/index.ts` | Partial — templates are inline in [app/dashboard/page.tsx](flowmind/apps/web/app/dashboard/page.tsx) (`TEMPLATES = [...]`), not extracted. |

## H. Organization UX

| # | Requirement | Status |
|---|---|---|
| H1 | Org switcher in header, cookie `flowmind-active-org` | Missing |
| H2 | `/onboarding` flow | Missing |
| H3 | Settings page with members/role/transfer | Missing |
| H4 | Server-side cookie validation | Missing |
| H5 | No-org → onboarding redirect | Missing |

## I. Knowledge ingestion

| # | Requirement | Status |
|---|---|---|
| I1 | `.txt`, `.md`, `.csv`, `.html`, `.pdf`, `.docx` supported | Partial — text formats only; PDF/DOCX missing. |
| I2 | URL/website ingestion claimed only if implemented | **Violated** — landing copy ([components/landing/hero.tsx:23-25](flowmind/apps/web/components/landing/hero.tsx#L23)) says "Upload PDFs, crawl websites." Neither is implemented. |
| I3 | Signed upload URL flow | Missing |
| I4 | Async ingestion with `documents.status = 'pending'/'processing'/'ready'/'failed'` | Missing — current upload is synchronous and returns the parsed text inline. |
| I5 | 25 MB file size limit | Partial — current limit is 4 MB. |
| I6 | 100-file/assistant limit | Missing — no enforcement. |
| I7 | Whitespace normalization, paragraph/sentence chunk breaks, ≥50 char skip | Partial — chunker normalizes `\r\n`, breaks on `\n\n` and sentence punctuation, but window sizes are 600 chars (spec wants ~4000 chars / ~1000 tokens). |
| I8 | Chunk metadata `{ documentId, filename, sourceType, pageNumber?, chunkIndex }` | Partial — `{ id, documentId, assistantId, index, text }`; no `pageNumber`, no `sourceType`, no `filename`. |
| I9 | Gemini `text-embedding-004`, batches of 100, retries, `LLM_KEY_MISSING` on missing key | Missing — no embedding step at all. |
| I10 | `usage_events { event_type: 'document_ingested' }` | Missing |

## J. Retrieval

| # | Requirement | Status |
|---|---|---|
| J1 | `retrieveRelevantChunks(...)` server function | Missing — [lib/runtime/services.ts](flowmind/apps/web/lib/runtime/services.ts) calls `useKnowledgeStore.getState().search(...)` in the browser. |
| J2 | Postgres `match_document_chunks(...)` cosine search joining `documents` | Missing |
| J3 | SQL-layer `org_id`/`assistant_id` filter | Missing — filter today is JS `chunks.filter(c => c.assistantId === ...)` |
| J4 | Citation-ready return shape | Partial — current `SearchHit` has `chunk.text`, `chunk.documentId`, `score`. No `documentName`, no `chunkId`. |
| J5 | No cross-org/cross-assistant leakage | Vacuously true (one browser store per browser), but design fails the moment we go server-side. |
| J6 | Server-resolved `orgId`/`assistantId`, never client-supplied | Violated by design — caller passes `assistantId`. |

## K. Chat runtime (public)

| # | Requirement | Status |
|---|---|---|
| K1 | `POST /api/chat/[publicId]` endpoint | Missing — there is no `/api/chat/...` route. The closest is `/api/published/[id]` which returns the raw graph for client-side runtime. |
| K2 | CORS `*` on public chat + OPTIONS preflight | Missing |
| K3 | Rate limits 30/min per (IP+sessionId), 1000/day per publicId | Missing |
| K4 | Lookup `published_assistants` by `public_id` where `status='published'` | Missing (and `status` column doesn't exist on the current table) |
| K5 | Server-side resolution of `org_id`/`assistant_id` from published row | N/A (table has no `org_id`) |
| K6 | Conversation row with `channel='web'`, `published_assistant_id`, `session_id` | Missing |
| K7 | Server-side retrieval before LLM call | Missing |
| K8 | Use `settings_snapshot` not live settings | Missing |
| K9 | Centralized prompt + `[doc:N]` citations | Missing |
| K10 | `usage_events { event_type: 'public_message' }` | Missing |
| K11 | Response shape `{ answer, citations, conversationId }` | Missing |

## L. Builder test chat

| # | Requirement | Status |
|---|---|---|
| L1 | `POST /api/assistants/[assistantId]/test-chat` with `requireAssistantAccess` | Missing |
| L2 | Live `assistants.graph`/`settings` | N/A (no DB record) |
| L3 | `retrieveRelevantChunks` server-side | Missing |
| L4 | `gemini-2.5-flash` | **Violated** — uses `gemini-2.0-flash-exp`. |
| L5 | Conversations with `channel='test'`, `metadata.isTest = true` | Missing |
| L6 | Returns `answer + citations` | Partial — `/api/llm-complete` returns `text` only, no citations. |

## M. Publish flow

| # | Requirement | Status |
|---|---|---|
| M1 | Auth + role check | Missing |
| M2 | Snapshot `graph` + `settings` into new row | Partial — graph is snapshotted; no `settings_snapshot` column exists. |
| M3 | `version` bumped per publish | Exists ✓ |
| M4 | `public_id = pub_<32-char-base62>` via `crypto.randomBytes` | **Violated** — `pub_<nanoid(12)>` (≈12-char URL-safe alphabet, much shorter and lower entropy). |
| M5 | Returns `{ publicId, hostedUrl, embedCode, version }` | Partial — returns `{ publishId, version }`; client computes URL/embed code itself. |
| M6 | `unpublishAssistant` + `republishAssistant` | Missing |
| M7 | Hosted URL `{NEXT_PUBLIC_APP_URL}/chat/{publicId}` | Exists ✓ (route at [app/chat/[assistantId]/page.tsx](flowmind/apps/web/app/chat/[assistantId]/page.tsx)) |
| M8 | Embed `<script src="/widget.js" data-flowmind-id=...>` | Partial — widget exists at [public/widget.js](flowmind/apps/web/public/widget.js), but uses `data-flowmind-assistant` instead of `data-flowmind-id`. |
| M9 | `?embed=1` chat strips chrome, framing allowed | Partial — `embed` flag handled in `HostedChat`; no explicit `X-Frame-Options` override audit done. |

## N. Analytics

| # | Requirement | Status |
|---|---|---|
| N1 | Conversation count 7d/30d/all-time | Partial — current panel returns "last 24h" + cumulative, not 7d/30d. |
| N2 | Message count user vs assistant | Missing — no `messages` table. |
| N3 | Last active time | Missing |
| N4 | Top user questions (group-by) | Missing |
| N5 | Citation usage rate | Missing |
| N6 | Failed-answer count ("not enough information") | Missing |
| N7 | All queries scoped by `org_id` + `assistant_id` | **Violated** — no `org_id` exists. |

## O. UI updates

Existing UI surfaces (live):
- Dashboard ✓ (but reads localStorage)
- Editor shell with Story / Canvas / Knowledge / Test / Deploy / Analytics tabs ✓
- Knowledge manager ✓ (but localStorage-backed)
- Test chat (Simulator) ✓
- Deploy panel ✓
- Analytics panel ✓ (DB-backed for conversations only)
- Hosted public chat ✓
- Widget ✓

Required new surfaces:
- Login / signup / logout pages — Missing
- `/onboarding` — Missing
- Settings → organization — Missing
- Org switcher in header — Missing
- Document processing-status badges + polling — Missing
- Citations chips on test chat — Missing
- Cascade-delete confirmation dialog — Missing

## P. Existing localStorage migration

Two keys to migrate, both authoritative (see audit 02): `flowmind-assistants`, `flowmind-knowledge`. Migration UI is Missing.

## Q. Error handling

Required error codes vs current state:

| Code | Used? |
|---|---|
| `UNAUTHENTICATED`, `NOT_A_MEMBER`, `INSUFFICIENT_ROLE` | Missing — no auth |
| `NOT_FOUND` | Partial — routes return ad-hoc `{ error: 'not found' }` strings |
| `UNSUPPORTED_FILE_TYPE`, `FILE_TOO_LARGE` | Partial — `parse-document` returns plain-text error messages, no `code` field |
| `FILE_LIMIT_REACHED` | Missing |
| `EXTRACTION_FAILED`, `EMBEDDING_FAILED` | Missing |
| `LLM_KEY_MISSING` | **Violated** — current behavior silently stubs |
| `NO_KNOWLEDGE`, `ASSISTANT_DISABLED`, `RATE_LIMITED` | Missing |

No route returns the spec's `{ error: { code, message } }` shape.

## R. Verification scripts

| Script | Status |
|---|---|
| `npm run verify:rls` | Missing |
| `npm run verify:ingest` | Missing |
| `npm run verify:retrieval` | Missing |
| `npm run verify:publish` | Missing |

No `scripts/` directory under `flowmind/apps/web/` or anywhere in the active app tree.

## S. Acceptance criteria 1–15 (final)

| # | Criterion | Status |
|---|---|---|
| 1 | New user signs up + creates org | Missing (no auth) |
| 2 | Create a Knowledge Assistant | Partial — possible, but stored in localStorage |
| 3 | Assistant saved in Supabase, not localStorage | **Violated** |
| 4 | Upload `.txt`/`.md` knowledge file | Partial — parses, but never saved to DB |
| 5 | File stored in private Supabase Storage | Missing |
| 6 | File parsed → chunked → embedded → stored in `document_chunks` | Missing (BM25 only, in-browser) |
| 7 | Test question grounded in uploaded file | Partial — works in-browser; not server-side |
| 8 | Answer includes citations | Missing — no citation pipeline |
| 9 | Publish assistant | Partial — works but unauthed and no proper public_id |
| 10 | Public hosted chat answers from same KB | **Violated** — public chat uses *client-side* knowledge store, which means the visitor sees nothing because the owner's localStorage isn't theirs. |
| 11 | Different-browser still works | **Violated** — same root cause as #10. |
| 12 | Cross-org isolation | N/A (no orgs); will be missing |
| 13 | No service role key in browser | Vacuously true — service role key not in code at all |
| 14 | Copy doesn't claim unsupported features | **Violated** — landing copy claims "Upload PDFs, crawl websites" + "RAG with citations using pgvector + hybrid search"; none implemented |
| 15 | Clear setup instructions | Partial — top-level README missing |
