# FlowMind Spec

> **How this document relates to the prompt pack**
>
> This spec is the canonical product + engineering requirements document for FlowMind. The phased execution plan lives in `docs/flowmind-prompt-pack.md`. Where the original spec left decisions open (embedding model, chunk size, role matrix, file size limits, CORS, ingestion execution model, etc.), those decisions have been locked in here to match the prompt pack. If you change a locked decision, update both documents.

---

## 0. Context and primary goal

FlowMind is a visual AI assistant builder. The current prototype has a dashboard, assistant templates, a visual builder, a knowledge manager, publish flow, hosted chat, and Gemini integration. However, it is not production-safe for companies because assistant state and knowledge-base data are largely stored in browser `localStorage`. Published assistants can store graph snapshots in Supabase, but the actual knowledge chunks are not cloud-published or tenant-scoped. The app needs to become a real SaaS platform where companies can securely upload knowledge, build assistants, publish widgets, and chat against server-side RAG.

**Primary goal:** build the company-safe FlowMind platform using Supabase Auth, Supabase Postgres, Row Level Security, private Supabase Storage, and server-side retrieval. A company should never need to give FlowMind access to its production database. Instead, company users upload files, connect knowledge sources, or provide read-only sources. FlowMind stores parsed documents, chunks, embeddings, assistants, conversations, and published assistant config in a tenant-isolated database.

Do not create a toy implementation. Remove or replace `localStorage` as the source of truth for assistants and knowledge. `localStorage` may only be used for temporary draft autosave or UI convenience, never as the authoritative source for company knowledge or published assistants.

Preserve the existing product direction and visual builder. Make the backend secure and real.

---

## 1. Locked technical decisions

These are binding. Changing any of them requires updating this spec, the prompt pack, and any code already written against them.

| Decision | Value |
|---|---|
| Framework | Next.js 15, App Router, TypeScript strict mode |
| Auth library | `@supabase/ssr` |
| Database | Supabase Postgres + pgvector |
| Vector index | HNSW on `document_chunks.embedding` using `vector_cosine_ops` |
| Embedding model | Gemini `text-embedding-004` (768 dimensions) |
| Chat model | Gemini `gemini-2.5-flash` |
| Vector column type | `vector(768)` |
| Chunk target size | ~1000 tokens (~4000 chars) |
| Chunk overlap | ~150 tokens (~600 chars) |
| Validation | Zod on every server boundary |
| PDF extraction | `pdf-parse` |
| DOCX extraction | `mammoth` |
| HTML extraction | `node-html-parser` or equivalent safe parser |
| File types supported at MVP | `.txt`, `.md`, `.csv`, `.html`, `.pdf`, `.docx` |
| URL / website ingestion | **Out of scope for MVP.** UI must not claim support. |
| File size limit | 25 MB per upload |
| File count limit | 100 files per assistant (MVP) |
| Ingestion execution model | Async. Upload returns immediately; processing runs in a background route handler; UI polls `document.status`. |
| Upload path | Client uploads directly to Supabase Storage using a signed upload URL issued by a server route |
| Public chat session | Client generates a UUID `sessionId`, persists in widget-local `sessionStorage` for continuity (not authoritative) |
| Public chat rate limits | 30 req/min per (IP + sessionId); 1000 req/day per published assistant |
| CORS | Public chat endpoint + `/widget.js`: `*` origin. All other endpoints: same-origin only |
| Widget | Single `/widget.js` file served from the Next.js app |

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

## 2. Security requirements (non-negotiable)

1. Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser. Every file that imports it must start with `import 'server-only'`.
2. Use Supabase Auth for all dashboard and builder access.
3. Use Row Level Security on every company-owned table.
4. Every company-owned row must include `org_id`.
5. Users may only access organizations where they have a `memberships` row.
6. Public chat widgets may call public chat endpoints, but those endpoints must not expose raw documents, raw chunks, private graphs, service credentials, or unrestricted database access.
7. Uploaded files must be stored in private Supabase Storage buckets.
8. Public assistant IDs must be unguessable (32+ chars of base62 randomness) and safe to expose.
9. Published assistant runtime must retrieve knowledge server-side.
10. Never trust client-provided `org_id`, `assistant_id`, or published assistant ownership. Always validate server-side from the authenticated session or the published assistant lookup.
11. The `anon` key must not be able to select from `documents`, `document_chunks`, `conversations`, `messages`, or `published_assistants` directly. Public access goes through server endpoints using the service role.

---

## 3. Architecture target

```
User browser
  -> Next.js app (App Router)
  -> Supabase Auth (via @supabase/ssr)
  -> Next.js API routes / server actions
  -> Supabase Postgres with RLS
  -> Supabase Storage private bucket (knowledge-files)
  -> pgvector embeddings
  -> Gemini (embeddings + chat)
```

---

## 4. Core user flow

1. User signs up or logs in.
2. User creates or joins an organization.
3. User creates an assistant inside that organization.
4. User uploads company knowledge files or adds knowledge sources.
5. Backend stores original files privately, parses them, chunks them, embeds them, and stores document chunks in Postgres.
6. User configures the assistant in the visual builder.
7. User tests the assistant in the builder.
8. User publishes the assistant.
9. A public hosted chat page or embeddable widget sends messages to a server-side chat endpoint.
10. The server endpoint retrieves relevant chunks, calls the LLM, and returns an answer with citations.

---

## 5. Implementation tasks

### A. Audit and setup

1. Inspect the repository and identify the active app directory. The live implementation may be inside a subfolder (e.g. `flowmind/apps/web`).
2. Identify all `localStorage` usage related to assistants, knowledge, conversations, publishing, and analytics.
3. Keep UI components where possible, but replace persistence and retrieval with backend-backed functionality.
4. Add clear environment variable documentation in `.env.example`.

**Required environment variables:**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
NEXT_PUBLIC_APP_URL=
```

### B. Supabase Auth

1. Add login, signup, logout, and session handling using `@supabase/ssr`.
2. Protect dashboard, builder, knowledge, deploy, analytics, and assistant management routes via middleware.
3. Redirect unauthenticated users to `/login`.
4. After signup, send the user to `/onboarding` to create an organization.
5. Store user profile data in a `profiles` table, populated by an `on_auth_user_created` trigger.

### C. Database schema

Create Supabase migrations for the following tables. Use UUID primary keys unless noted. All tables have RLS enabled.

#### profiles
- `id uuid primary key references auth.users(id)`
- `email text`
- `full_name text`
- `avatar_url text`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

#### organizations
- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `slug text unique`
- `created_by uuid references auth.users(id)`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

#### memberships
- `id uuid primary key default gen_random_uuid()`
- `org_id uuid references organizations(id) on delete cascade`
- `user_id uuid references auth.users(id) on delete cascade`
- `role text not null check (role in ('owner', 'admin', 'member', 'viewer'))`
- `created_at timestamptz default now()`
- `unique(org_id, user_id)`

#### assistants
- `id uuid primary key default gen_random_uuid()`
- `org_id uuid references organizations(id) on delete cascade`
- `created_by uuid references auth.users(id)`
- `name text not null`
- `description text`
- `status text not null default 'draft'`
- `graph jsonb not null default '{}'::jsonb`
- `settings jsonb not null default '{}'::jsonb`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

#### knowledge_sources
- `id uuid primary key default gen_random_uuid()`
- `org_id uuid references organizations(id) on delete cascade`
- `assistant_id uuid references assistants(id) on delete cascade`
- `type text not null check (type in ('file', 'url', 'text', 'api'))`
- `uri text`
- `title text`
- `status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed'))`
- `error text`
- `metadata jsonb not null default '{}'::jsonb`
- `created_by uuid references auth.users(id)`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

> Note: at MVP only `type = 'file'` is supported end-to-end. Other types are reserved for future use.

#### documents
- `id uuid primary key default gen_random_uuid()`
- `org_id uuid references organizations(id) on delete cascade`
- `assistant_id uuid references assistants(id) on delete cascade`
- `source_id uuid references knowledge_sources(id) on delete cascade`
- `storage_path text`
- `name text not null`
- `mime_type text`
- `sha256 text`
- `size_bytes bigint`
- `status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed'))`
- `error text`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

#### document_chunks
- `id uuid primary key default gen_random_uuid()`
- `org_id uuid references organizations(id) on delete cascade`
- `assistant_id uuid references assistants(id) on delete cascade`
- `document_id uuid references documents(id) on delete cascade`
- `chunk_index integer not null`
- `content text not null`
- `token_count integer`
- `embedding vector(768)`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz default now()`
- `unique(document_id, chunk_index)`

#### published_assistants
- `id uuid primary key default gen_random_uuid()`
- `public_id text unique not null`
- `org_id uuid references organizations(id) on delete cascade`
- `assistant_id uuid references assistants(id) on delete cascade`
- `version integer not null default 1`
- `graph_snapshot jsonb not null`
- `settings_snapshot jsonb not null default '{}'::jsonb`
- `status text not null default 'published' check (status in ('published', 'disabled'))`
- `visibility text not null default 'public' check (visibility in ('public', 'private'))`
- `created_by uuid references auth.users(id)`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

#### conversations
- `id uuid primary key default gen_random_uuid()`
- `org_id uuid references organizations(id) on delete cascade`
- `assistant_id uuid references assistants(id) on delete cascade`
- `published_assistant_id uuid references published_assistants(id) on delete set null`
- `session_id text`
- `user_id uuid references auth.users(id) on delete set null`
- `channel text not null default 'web'`
- `created_at timestamptz default now()`

#### messages
- `id uuid primary key default gen_random_uuid()`
- `org_id uuid references organizations(id) on delete cascade`
- `conversation_id uuid references conversations(id) on delete cascade`
- `role text not null check (role in ('user', 'assistant', 'system', 'tool'))`
- `content text not null`
- `citations jsonb not null default '[]'::jsonb`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz default now()`

#### usage_events
- `id uuid primary key default gen_random_uuid()`
- `org_id uuid references organizations(id) on delete cascade`
- `assistant_id uuid references assistants(id) on delete cascade`
- `event_type text not null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz default now()`

### D. Database extensions and indexes

1. Enable `vector` (pgvector) and `pgcrypto`.
2. Add HNSW index on `document_chunks.embedding` using `vector_cosine_ops`.
3. B-tree indexes on every `org_id`, `assistant_id`, `document_id`, `conversation_id`, `public_id`, and `created_at` column that will be queried.
4. Unique index on `published_assistants.public_id`.
5. Unique index on `memberships(org_id, user_id)`.
6. `updated_at` trigger function shared across tables that need it.

### E. Row Level Security

Enable RLS on every table. Create helper functions:
- `public.is_org_member(org uuid)` — boolean based on `auth.uid()` membership.
- `public.org_role(org uuid)` — returns role or null.

Policy requirements:

1. A user can read an organization only if they are a member.
2. A user can read memberships for orgs they belong to.
3. Owners and admins can invite, update, and remove members (admins cannot modify owners).
4. Members can read and write assistants in their org. Viewers can read but not modify.
5. Viewers can read knowledge, documents, and analytics but cannot upload or delete.
6. Only org members can read `knowledge_sources`, `documents`, `document_chunks`, `conversations`, `messages`, and `usage_events`. Writes to `conversations`, `messages`, and `usage_events` happen via the service role from server endpoints.
7. Public published assistant lookup does not use direct client table access — it goes through the server-side public chat endpoint.
8. The `anon` key must not be broadly readable on any table. Prefer server endpoints for public runtime.

### F. Storage

1. Create a private Supabase Storage bucket named `knowledge-files`.
2. Store files at paths like:
   ```
   orgs/{org_id}/assistants/{assistant_id}/documents/{document_id}/{filename}
   ```
3. Uploads go through a server route that issues a signed upload URL after validating auth, org membership, role, and file type/size.
4. Users cannot read files from other orgs (enforced via `storage.objects` RLS on the `orgs/{their_org_id}/` path prefix).
5. The public widget never exposes direct private storage URLs.

### G. Assistant persistence

Replace `localStorage` assistant persistence with Supabase-backed CRUD.

Required server behavior (server actions wrapping typed CRUD):

1. Create assistant.
2. List assistants for the current organization.
3. Read assistant by id.
4. Update assistant graph and settings.
5. Delete assistant.
6. Duplicate assistant from a template.
7. Save builder changes to `assistants.graph` (debounced, ~1 save per 2s).
8. Optimistic UI where helpful, but the database is the source of truth.

Template definitions live in `lib/templates/index.ts` as plain data, not DB rows.

### H. Organization UX

1. Current org selector in the app header. Selected org stored in a cookie named `flowmind-active-org` (not `localStorage`).
2. Create organization flow at `/onboarding`.
3. Organization settings page with members list, role changes, remove member, transfer ownership.
4. Always validate the cookie-selected org against real membership server-side.
5. If the user has no org, show onboarding.

### I. Knowledge ingestion

Supported MVP file types: `.txt`, `.md`, `.csv`, `.html`, `.pdf`, `.docx`. URL / website ingestion is out of scope for MVP; the UI must not claim support.

**Upload flow:**

1. Client calls `POST /api/knowledge/upload-url` with `{ assistantId, filename, sizeBytes, mimeType }`.
2. Server validates auth, org membership, role >= member, file extension against the allowlist, size <= 25 MB, and the per-assistant 100-file limit.
3. Server generates a storage path `orgs/{orgId}/assistants/{assistantId}/documents/{newDocumentId}/{sanitizedFilename}`, inserts `knowledge_sources` and `documents` rows with `status = 'pending'`, and returns a signed upload URL + `documentId`.
4. Client PUTs the file directly to Supabase Storage using the signed URL.
5. Client calls `POST /api/knowledge/ingest` with `{ documentId }`.

**Ingestion pipeline (async):**

1. `POST /api/knowledge/ingest` validates auth + role, marks `documents.status = 'processing'`, returns 202, and triggers `processDocument(documentId)` via `waitUntil` or equivalent background execution.
2. `processDocument` downloads the file via the service-role client, extracts text, chunks, embeds, and bulk-inserts `document_chunks` with `org_id` and `assistant_id`.
3. On success: `documents.status = 'ready'`, `knowledge_sources.status = 'ready'`, emit `usage_events { event_type: 'document_ingested' }`.
4. On failure at any stage: `documents.status = 'failed'` with a user-readable error message. No orphan chunks.

**Chunking requirements:**

- Normalize whitespace (collapse runs, trim).
- Target ~1000 tokens per chunk with ~150-token overlap (approximated via chars: ~4000 chars per chunk, ~600 char overlap).
- Break on paragraph or sentence boundaries where possible.
- Preserve metadata: `{ documentId, filename, sourceType, pageNumber?, chunkIndex }`.
- Skip chunks under 50 chars.

**Embedding requirements:**

- Gemini `text-embedding-004`, `taskType: RETRIEVAL_DOCUMENT` for ingestion.
- Batch up to 100 chunks per request.
- Exponential backoff retry on 429/5xx.
- Vector dimension 768, matching the `vector(768)` column.
- If `GEMINI_API_KEY` is missing, fail loudly with `LLM_KEY_MISSING`.

### J. Retrieval

Server function:

```ts
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

Behavior:

1. Embed the query with Gemini `text-embedding-004`, `taskType: RETRIEVAL_QUERY`.
2. Use a Postgres function `match_document_chunks(p_org_id, p_assistant_id, p_query_embedding, p_match_count)` that does cosine similarity search and joins `documents` for the document name.
3. Filter by `org_id` and `assistant_id` at the SQL layer — never in application code only.
4. Return citation metadata sufficient to display source references in the UI.
5. Never return chunks from another org or assistant.
6. The function is only called from server code that has already validated the caller's authorization. `orgId` and `assistantId` are resolved server-side from the authenticated session or from the published assistant lookup — never from client input.

Out of scope for MVP (desirable later):
- Hybrid retrieval with keyword scoring plus vector similarity.
- Reranking.
- Near-duplicate chunk deduplication.

### K. Chat runtime

**Public endpoint:** `POST /api/chat/[publicId]`

Request body (validated with Zod):
```json
{
  "message": "user question (1-4000 chars)",
  "sessionId": "uuid"
}
```

Behavior:

1. No Supabase auth. CORS headers allow `*` origin. Handle OPTIONS preflight.
2. Apply rate limits: 30 req/min per (IP + sessionId), 1000 req/day per publicId. In-memory/DB limiter for MVP, documented TODO for Redis/Upstash.
3. Look up `published_assistants` by `public_id` where `status = 'published'`. If missing or disabled, return 404 with `{ error: { code: 'ASSISTANT_DISABLED', message: 'Assistant not available.' } }`.
4. Resolve `org_id` and `assistant_id` from the published row. Never trust the client.
5. Create or continue a `conversations` row with `channel = 'web'`, `published_assistant_id = <row.id>`, `session_id` from the body.
6. Store the user message.
7. Call `retrieveRelevantChunks` with the resolved `orgId` and `assistantId`.
8. Build a grounded prompt using `published_assistants.settings_snapshot` (not the live assistant settings).
9. Call Gemini `gemini-2.5-flash`.
10. Parse citations, store the assistant message, emit `usage_events`.
11. Return:

```json
{
  "answer": "...",
  "citations": [
    {
      "documentId": "...",
      "title": "...",
      "chunkIndex": 0,
      "snippet": "..."
    }
  ],
  "conversationId": "..."
}
```

**Prompt instructions (centralized in `lib/llm/prompt.ts`):**

- Answer using only the provided context.
- If the answer is not in the context, respond: "I don't have enough information in the knowledge base to answer that."
- Do not invent prices, policies, commitments, or legal claims.
- Cite sources using `[doc:N]` markers that reference the provided context blocks.
- Tone is configurable via `settings_snapshot.systemPrompt`.

### L. Builder test chat

**Authenticated endpoint:** `POST /api/assistants/[assistantId]/test-chat`

Behavior:

1. Validate auth and `requireAssistantAccess(assistantId, 'viewer')`.
2. Resolve `orgId` from the live assistant row.
3. Use the live `assistants.graph` and `assistants.settings` (not a snapshot).
4. Retrieve chunks server-side via the same `retrieveRelevantChunks` function.
5. Call Gemini `gemini-2.5-flash`.
6. Return answer + citations.
7. Store test messages with `conversations.channel = 'test'` and metadata `{ isTest: true }`.

### M. Publish flow

On publish:

1. Validate auth + role >= member.
2. Snapshot `graph` and `settings` into a new `published_assistants` row.
3. Increment `version` if a prior version exists; otherwise `version = 1`.
4. Generate `public_id` as `pub_<32-char-base62>` via `crypto.randomBytes`. Uniqueness required.
5. Return `{ publicId, hostedUrl, embedCode, version }`.
6. Provide `unpublishAssistant` (sets `status = 'disabled'`, keeps the row) and `republishAssistant` (equivalent to a new publish with incremented version).

**Hosted URL shape:**
```
{NEXT_PUBLIC_APP_URL}/chat/{publicId}
```

**Embed code shape:**
```html
<script src="{NEXT_PUBLIC_APP_URL}/widget.js" data-flowmind-id="{publicId}" async></script>
```

The widget is served from `/widget.js` as a self-contained JS bundle. It reads `data-flowmind-id` from its own `<script>` tag and injects a floating chat button + iframe pointing at `/chat/[publicId]?embed=1`. The `?embed=1` chat page strips the app header/footer and allows framing from anywhere.

### N. Analytics

Replace any fake or local analytics with database-backed queries scoped by `org_id` and `assistant_id`.

Track:

1. Conversation count (7d, 30d, all time).
2. Message count (user vs assistant).
3. Last active time.
4. Top user questions (lowercase-normalized group-by for MVP).
5. Citation usage rate (fraction of answers with ≥1 citation).
6. Failed-answer count (assistant messages flagged "not enough information").

### O. UI updates

Required pages/components:

1. Auth pages (login, signup, logout).
2. Org onboarding (`/onboarding`).
3. Dashboard assistant list from Supabase.
4. Builder with server-backed save/load.
5. Knowledge manager backed by server upload and document list.
6. Processing status for documents (pending → processing → ready/failed), with polling while in-flight.
7. Delete document/source with cascade warning.
8. Test chat with citations (inline chips linking to source chunk).
9. Deploy panel with real hosted link and embed code, plus disable/republish.
10. Analytics page with DB-backed data.

Remove or revise any claim that is not implemented:

- PDF and DOCX are implemented; HTML stripping is implemented.
- Website crawling is **not** implemented — remove any claims.
- Citations are implemented.
- pgvector is implemented.

### P. Existing localStorage migration

If the audit in Phase 0 finds existing `localStorage` assistant data:

1. Detect local assistants.
2. Show a one-time "Import local assistants" button on the dashboard.
3. Preview the items to be imported.
4. On confirm, call a server action that inserts them into the active org.
5. After import, clear the localStorage keys.
6. Never write authoritative data to localStorage going forward.

### Q. Error handling

Return a consistent error shape from every server route and server action:

```json
{ "error": { "code": "ERROR_CODE", "message": "Human-readable text" } }
```

Required error codes:

- `UNAUTHENTICATED`
- `NOT_A_MEMBER`
- `INSUFFICIENT_ROLE`
- `NOT_FOUND`
- `UNSUPPORTED_FILE_TYPE`
- `FILE_TOO_LARGE`
- `FILE_LIMIT_REACHED`
- `EXTRACTION_FAILED`
- `EMBEDDING_FAILED`
- `LLM_KEY_MISSING`
- `NO_KNOWLEDGE`
- `ASSISTANT_DISABLED`
- `RATE_LIMITED`

Do not silently return fake success for production features.

### R. Tests and verification

Ship verification scripts runnable via npm:

- `npm run verify:rls` — cross-tenant read/write denial on every table.
- `npm run verify:ingest` — upload, ingest, cross-org isolation, size/type rejection, corrupt-file failure.
- `npm run verify:retrieval` — grounded answers on ingested content; "not enough information" on unrelated questions; no cross-org leakage.
- `npm run verify:publish` — publish, public chat works, different-browser continuity, disable stops the endpoint, anon-key can't read `published_assistants` directly, rate limiter bites under load.

### S. Acceptance criteria

The work is complete only when all of the following are true:

1. A new user can sign up and create an organization.
2. The user can create a Knowledge Assistant.
3. The assistant is saved in Supabase, not localStorage.
4. The user can upload at least a `.txt` or `.md` knowledge file.
5. The file is stored in private Supabase Storage.
6. The file is parsed, chunked, embedded, and stored in `document_chunks`.
7. The user can ask a test question in the builder and receive an answer grounded in the uploaded file.
8. The answer includes citation metadata.
9. The user can publish the assistant.
10. A public hosted chat link can answer from the same uploaded knowledge base.
11. Opening the published chat in a different browser still works because retrieval is server-side.
12. Another user from another org cannot access the first org's assistants, files, chunks, conversations, or analytics.
13. No service role key is exposed to the browser.
14. The landing/product copy does not claim unsupported features.
15. The codebase has clear setup instructions.

### T. Deliverables

1. Supabase migrations.
2. Updated Next.js app code.
3. Server-side auth helpers (`lib/auth/guards.ts`, `lib/supabase/*`).
4. RLS policies.
5. Storage setup instructions.
6. Knowledge ingestion code (`lib/ingest/*`).
7. Retrieval code (`lib/retrieval/*`).
8. Chat runtime endpoint (`/api/chat/[publicId]`).
9. Publish endpoint and deploy panel.
10. UI updates.
11. `.env.example`.
12. README section covering local setup, Supabase setup, and the end-to-end test flow.
13. `docs/implementation-summary.md` listing changed files per phase and mapping each acceptance criterion to the file + function that satisfies it.

### U. Engineering style

1. Prefer simple, readable code over clever abstractions.
2. Keep server-only code server-only (`import 'server-only'` at the top of every file using privileged credentials).
3. Validate all inputs with Zod at every server boundary.
4. Use TypeScript types for database records and API payloads (generated via `supabase gen types typescript`).
5. Do not duplicate authorization logic. Use shared guards in `lib/auth/guards.ts`.
6. Centralize LLM prompts in `lib/llm/prompt.ts`.
7. Make failures visible in the UI with the error codes in section Q.
8. Do not leave mock/stub paths in production flows. Dev-only paths must be guarded by `process.env.NODE_ENV`.
9. Do not remove useful existing UI unless necessary.
10. Make the platform work end-to-end before adding fancy features.

---

## 6. Execution

Follow the phased plan in `docs/flowmind-prompt-pack.md`:

- **Phase 0** — Audit + plan (docs only, no code).
- **Phase 1** — Migrations, RLS, Supabase clients, auth guards, type generation.
- **Phase 2** — Auth flows, org onboarding, membership management, org switcher.
- **Phase 3** — Assistant persistence; kill localStorage as source of truth.
- **Phase 4** — Knowledge ingestion (upload → extract → chunk → embed).
- **Phase 5** — Retrieval function and authenticated builder test chat.
- **Phase 6** — Publish flow, public chat endpoint, embeddable widget.
- **Phase 7** — Analytics, error-code pass, copy cleanup, legacy migration, final security sweep.

Start with Phase 0. Do not begin the next phase until the previous phase's acceptance checks pass.
