# FlowMind — Full Product Summary

**© 2026 Varshini Akula. All rights reserved.** Proprietary — see [LICENSE](../LICENSE).

_This document describes the **actual current state** of the codebase, not just the target
spec. Where the two differ, both are called out._

Companion docs: [flowmind-spec.md](flowmind-spec.md) (canonical requirements),
[flowmind-prompt-pack.md](flowmind-prompt-pack.md) (phased plan),
[audit/](audit/) (Phase 0 findings), [plan/implementation-plan.md](plan/implementation-plan.md).

---

## 1. What FlowMind is

**FlowMind is a visual builder for AI chat assistants.** You describe an assistant in
plain English or drag nodes onto a canvas to design a conversation flow, ground its
answers in your own uploaded documents (RAG), test it in a live simulator, and publish
it as a hosted chat page or embeddable website widget.

The **product vision** (per the spec) is a **company-safe, multi-tenant SaaS platform**:
organizations sign up, upload private knowledge, build assistants, and publish widgets —
all with server-side retrieval and strict tenant isolation, so a company never has to
expose its production database.

There are **two realities in this repo today**, and understanding the gap between them is
the whole point of this document:

| | **What ships today** | **What the spec targets** |
|---|---|---|
| Data home | **Supabase Postgres with RLS** (assistants) | Supabase Postgres with RLS |
| Auth | **Email/password login (`@supabase/ssr`)** | Supabase Auth + org membership |
| Tenancy | **Per-user isolation** (one personal org each) | Multi-tenant orgs + roles |
| Knowledge | **Supabase Storage + server-parsed chunks** (`.txt/.md/.csv/.html`) | Private Storage + Edge-Function ingestion, `.pdf/.docx` too |
| Retrieval | **Server-side pgvector** (gemini-embedding-001, HNSW cosine) with BM25-lite fallback | + reranking, hybrid search |
| LLM | LLM Response node: **Gemini BYOK** → **FlowMind Groq demo** (limited, atomically capped) → platform Gemini (opt-in) → deterministic simulation | Gemini `gemini-2.0-flash` · Groq `openai/gpt-oss-20b` |
| Publish | Legacy table via anon key | New schema, unguessable public IDs, service-role runtime |

Today's app has **real accounts and per-user assistant history** backed by Supabase + RLS,
**server-side knowledge ingestion + vector retrieval** (Gemini embeddings, pgvector cosine,
BM25 fallback), **real LLM answers** (Gemini BYOK or the FlowMind Groq demo), and an **offline
eval harness**. Multi-member organizations, PDF/DOCX extraction, and the new versioned
publish + embeddable-widget path are not built yet.

---

## 2. Repository layout

Monorepo at the repo root (`pnpm` + `turbo`):

```
FlowAI/                          # repository root (product = FlowMind)
├── docs/                        # spec, prompt pack, audit, plan, this file
└── flowmind/                    # ACTIVE product (Next.js monorepo)
    ├── apps/web/                # the Next.js 15 app (everything below lives here)
    ├── packages/shared/         # shared TS types, node-type constants, Zod validators
    └── supabase/                # migrations, config (Phase 1)
```

- **`flowmind/apps/web/`** is the live implementation.
- An older Python/React prototype (formerly `flowchat/`, once called "FlowChat") was
  **removed** from the repo; it's recoverable from git history if ever needed.
- A **live demo** runs at `flowmind-nine-tau.vercel.app`, served from the **single consolidated
  Supabase project** (auth + per-user assistants **and** the legacy publish/hosted-chat demo
  tables recreated via migration `0008`; see §5).

---

## 3. Feature-by-feature: what works, what's partial, what's missing

Legend: ✅ works now · 🟡 partial / prototype-grade · ❌ not built yet

### 3.1 Landing / marketing page — ✅
- Redesigned to the "Lumina SaaS" look (see §6). Hero, product-preview card, feature grid,
  header, footer. Brand is **FlowMind** throughout.
- Copy matches reality (the old "crawl websites" claim was removed).

### 3.2 Authentication & per-user isolation — ✅ (accounts) / ❌ (multi-member orgs)
- **Live:** email/password **sign up / sign in / sign out** via `@supabase/ssr`. `middleware.ts`
  protects `/dashboard` and `/editor` and redirects unauthenticated users to `/login`.
- On first login, a **personal organization** ("My Workspace") is created automatically via
  the `bootstrap_organization()` SECURITY DEFINER function. Every user has exactly one org;
  RLS scopes all data by org membership, so **one user never sees another's assistants**.
- **Not built:** the multi-member org experience — invitations, roles, member management, and
  an org switcher. Each account is a single personal workspace for now.
- Files: `middleware.ts`, `app/{login,signup}/`, `app/logout/route.ts`,
  `components/auth/auth-form.tsx`, `lib/db/orgs.ts`.

### 3.3 Dashboard & assistant management — ✅ (per-user, Supabase-backed)
- **Works:** list / create / open / **delete** (with confirmation) assistants, create from a
  template (Customer Support / Sales Qualifier / Knowledge Assistant), search.
- **Persistence:** assistants live in the Supabase `assistants` table, scoped to the user's
  org by RLS — **not** localStorage. The Zustand store is Supabase-backed with optimistic
  updates + background persistence; the editor loads/saves the graph from Supabase.
  Verified end-to-end (user A creates → user B sees nothing → A re-login sees theirs).
- Files: `stores/assistant-store.ts`, `lib/db/assistants.ts`.

### 3.4 Story Builder (NL → flow) — ✅ with caveat
- Type a plain-English description; it generates a working graph and drops you on the canvas.
- **Caveat:** in **demo mode** (no connected Gemini key — see §3.11 BYOK), generation uses a
  **deterministic heuristic** that matches keywords to one of a few archetypes (support /
  sales / knowledge / booking / feedback / default). It produces a generic flow, not a bespoke
  one, and **overwrites the assistant's name** with the archetype name. With a Gemini key
  connected (session BYOK or platform), it calls Gemini for richer, tailored generation.
- Provider errors (invalid key, quota, timeout) are surfaced as clear errors — not silently
  swapped for a heuristic result while a key is connected.
- Endpoint: `POST /api/generate-graph` (resolves the credential, then Gemini or heuristic).

### 3.5 Visual Canvas Builder — ✅
- Drag nodes from the palette onto a React Flow canvas; connect them; edit each node's
  fields in the right-hand **inspector**; changes reflect live and auto-save (debounced) to
  the Supabase `assistants` table (RLS-scoped), not localStorage.
- **Node types with working runtime handlers (6):** `message`, `input`, `choice`,
  `condition`, `rag_query`, `llm_response`.
- **Defined in shared constants but NOT executable** (no runtime handler, not in the
  palette): `http_action`, `transform`, `validator`, `human_handoff`, `loop`, `subflow`,
  `end`. These are placeholders for the future.
- The canvas is intentionally dark (a builder aesthetic), with a categorical color per node
  type.

### 3.6 Knowledge / ingestion — ✅ (Supabase-backed, embedded)
- **Works:** upload `.txt`, `.md`, `.csv`, `.html` (≤ 4 MB). `POST /api/knowledge/ingest`
  (guarded) stores the raw file in the **private `knowledge-files` Supabase Storage bucket**
  at `orgs/{org}/assistants/{assistant}/documents/{doc}/…`, parses + chunks it **server-side**,
  and writes `documents` + `document_chunks` rows — all RLS-scoped to the user's org.
  `DELETE /api/knowledge/[id]` removes the row, chunks (cascade), and the stored file.
- **Embeddings:** on ingest, chunks are embedded with Gemini `gemini-embedding-001`
  (`RETRIEVAL_DOCUMENT`, 768-dim) when a Gemini key is available and stored in
  `document_chunks.embedding`; without a key they are stored unembedded and retrieval uses BM25.
- **Retrieval:** see §3.7 — vector cosine search with a BM25 fallback, both via
  `POST /api/knowledge/search`.
- **Not yet:** `.pdf`/`.docx` extraction. Files: `app/api/knowledge/*`,
  `lib/gemini/embeddings.ts`, `lib/db/knowledge.ts`, `lib/knowledge/{extract,chunker,score}.ts`.
- **Target:** heavy extraction (pdfjs-dist, mammoth), ideally in a Supabase Edge Function.

### 3.7 Retrieval / RAG — ✅ (vector) / 🟡 (needs a Gemini key)
- **Works:** `POST /api/knowledge/search` embeds the query server-side (Gemini
  `gemini-embedding-001`, `RETRIEVAL_QUERY`, 768-dim) and cosine-matches stored chunk vectors
  via the `match_document_chunks` Postgres function over the HNSW index, filtered by
  `assistant_id`. Chunks are embedded on ingest (`RETRIEVAL_DOCUMENT`). Both the simulator's RAG
  node and the Knowledge tab's retrieval tester use this route; the tester shows whether a result
  was ranked by **vector similarity** or **keyword (BM25)**.
- **Graceful fallback:** when no Gemini key is available (BYOK or platform), or a chunk has no
  embedding yet, retrieval falls back to the **BM25-lite** lexical scorer — never a hard failure.
- **Backfill:** `pnpm --filter @flowmind/web backfill:embeddings` embeds any pre-existing chunks
  that were ingested before embeddings were enabled.
- **Note:** vector search activates only with a Gemini key set (embeddings need one). Groq does
  not provide embeddings; a Gemini key can be used for embeddings even while Groq serves chat.

### 3.8 Test simulator — ✅ with caveat
- **Works:** the "Test" tab runs the whole graph **client-side** with a real execution
  **Trace** (per-node events + timings) and a live **Variables** panel. Message, choice
  (option matching + variable capture), input (variable capture), condition, and template
  interpolation (`{{var}}`) all execute for real. Verified end-to-end on a flight-booking
  flow.
- **Caveat:** `llm_response` nodes call `POST /api/llm-complete`, which resolves a provider in
  precedence order — **Gemini BYOK → FlowMind Groq demo → (platform Gemini, only if
  `ALLOW_PLATFORM_GEMINI_LLM_FALLBACK=true`) → deterministic simulation** — and streams (SSE) or
  returns JSON. When no real provider is available (or the Groq allowance is reached / oversized
  prompt / provider outage before the first token) it returns a clearly-labeled deterministic
  simulation. The execution trace shows the provider, mode, model, token counts, and remaining
  demo allowance. No key material or provider reasoning ever appears in responses or traces.
- **Target:** an authenticated `POST /api/assistants/[id]/test-chat` endpoint
  doing server-side retrieval + Gemini, using the live assistant graph/settings.

### 3.9 Publish / hosted chat / widget — 🟡 (legacy) / ❌ (target)
- **Works today (legacy path):** `POST /api/publish` inserts a snapshot into a **legacy**
  `flowmind_published_assistants` table using the **anon key**, generates a `pub_<id>`, and a
  hosted chat page renders at `/chat/[id]`. Legacy `conversations`/`published`/`analytics`
  routes back this.
- **Not built (target):** publish against the **new** `published_assistants` schema with
  versioning + unguessable IDs; the **public** `POST /api/chat/[publicId]` endpoint (CORS
  `*`, rate limiting, service-role runtime, citations); the self-contained **`/widget.js`**
  embeddable widget; disable/republish (the next publish milestone).

### 3.10 Analytics — 🟡
- A legacy analytics route/panel exists (`/api/analytics/[assistantId]`), backed by the legacy
  publish tables — now recreated in the same consolidated Supabase project (see §5).
- **Target:** DB-backed analytics scoped by `org_id`/`assistant_id` — conversation
  and message counts, top questions, citation rate, failed-answer rate.

### 3.11 Gemini connection (session BYOK) — ✅
- FlowMind supports optional **session-based Gemini BYOK**. A user can connect a Gemini
  credential (dashboard / editor / Story / Simulator "Connect Gemini" control) to enable real
  graph generation and LLM-node responses. The credential is validated server-side (against a
  low-cost `models.list` request), **encrypted with AES-256-GCM in an HttpOnly session
  cookie**, **expires automatically** (default 4h), and is **never stored in browser
  persistence or the database** and never returned to the browser.
- **Three execution modes**, in precedence order: session **BYOK** → server **platform** key
  (`GEMINI_API_KEY`) → deterministic **fallback** (demo). The UI shows the current mode
  ("Gemini connected · ••••ABCD" / "Gemini available" / "Demo mode").
- Routes: `POST/GET/DELETE /api/integrations/gemini/{connect,status,disconnect}` (Node
  runtime, origin-checked, `Cache-Control: no-store`). SDK is `@google/genai`, centralized in
  `lib/gemini/client.ts`.
- **Out of scope (by design):** organization-scoped/permanent credentials, database-backed
  secret storage, published-widget owner credentials, and multi-provider support. It is a
  session BYOK feature — not an enterprise secret-management system.

### 3.12 FlowMind Groq demo (LLM Response node) — 🟡 optional
- A **limited, server-funded** fallback so a signed-in user **without** their own Gemini key
  still gets real AI on the LLM Response node. Off by default; enabled with `GROQ_DEMO_ENABLED=true`
  + a server-only `GROQ_API_KEY`. Model: **`openai/gpt-oss-20b`** (configurable).
- **Scope:** the `llm_response` node only. It does **not** power story-to-graph generation,
  embeddings, RAG, public hosted chats, or embeddable widgets — those keep their existing
  behavior. Only **authenticated** users can consume it.
- **Quota (atomic, in Postgres):** a per-user and a global **daily UTC** cap enforced by
  `reserve_platform_llm_request()` (transaction advisory lock; no in-memory counters), backed by
  the `platform_llm_daily_usage` table (deny-all RLS; service-role only). A request is reserved
  *before* the provider call and counts even if the provider then fails. Usage records store
  **metadata only** (provider, model, token counts, duration, success/failure) — never prompt
  content. Defaults: 5/user/day, 100/deployment/day, 6000-char prompt cap, 300 output tokens,
  30s timeout — all configurable.
- **Behavior:** Groq reasoning is requested with `reasoning_effort: 'low'` and is never exposed.
  A failure **before** the first token falls back transparently to simulation with a sanitized
  reason (`GROQ_USER_LIMIT_REACHED`, `GROQ_GLOBAL_LIMIT_REACHED`, `GROQ_RATE_LIMITED`,
  `GROQ_TIMEOUT`, `GROQ_PROMPT_TOO_LARGE`, …); a failure **after** streaming has begun emits an
  SSE `error` and closes (no mixed answer). A connected **Gemini BYOK** error is surfaced
  sanitized and does **not** silently switch to Groq.
- **Status:** `GET /api/llm-status` reports the selected provider + remaining demo allowance
  (`Cache-Control: no-store`, no key material). The simulator labels it **"FlowMind Demo AI"**
  with the remaining count, a privacy notice (the prompt is sent to Groq), and a **Connect
  Gemini** call-to-action. Never described as unlimited, permanently free, or production-grade.
- **Privacy:** demo requests send the LLM node prompt to Groq; the UI warns not to enter
  confidential, regulated, or personal information in the public prototype.

### 3.13 Evaluation harness — ✅
- **Offline, deterministic, provider-free** eval via `pnpm --filter @flowmind/web eval`
  (`scripts/eval.ts`, test set at `eval/testset.json`). No tokens spent, CI-friendly.
- **RAG metrics** (`lib/eval/metrics.ts`): precision@k, recall@k, hit@k, and MRR per query,
  scored with the BM25-lite lexical scorer over an inline corpus. (Vector-quality eval needs a
  Gemini key and is out of scope for the offline harness.)
- **Workflow metrics**: each case runs through the real runtime engine with stub services
  (fixed LLM reply + in-memory retrieval), reporting completion rate, node coverage, turn
  count, error rate, and captured-variable accuracy against declared expectations.
- The runner exits non-zero when a workflow case misses its expectation, so it doubles as a
  regression gate. No LLM-judge (groundedness/faithfulness) metric yet — a deliberate choice to
  keep the harness deterministic and free.

---

## 4. Backend foundation (Phase 1) — shipped, applied, verified

This is the production-grade database + security layer. It **exists and is provisioned**
(on the fresh Supabase project `dlxzeiwfebrukaefwriz`) but **no UI consumes it yet.**

**Migrations** (`flowmind/supabase/migrations/`):
- `0001_init.sql` — 11 tables in dependency order + shared `set_updated_at()` trigger.
- `0002_indexes.sql` — HNSW index on `document_chunks.embedding` (`vector_cosine_ops`) +
  B-tree indexes on all queried FKs/timestamps + uniques.
- `0003_rls.sql` — RLS enabled + forced on every table; `is_org_member()` / `org_role()`
  helpers; per-table policies.
- `0004_storage.sql` — private `knowledge-files` bucket + member-only path RLS.
- `0005_invitations.sql` — invite-by-email table (schema for Phase 2).
- `0006_bootstrap_org.sql` — `bootstrap_organization()` (the one approved `SECURITY DEFINER`).
- `0007_rls_helpers_definer.sql` — makes the two helpers `SECURITY DEFINER` to break RLS
  recursion on `memberships`.

**The 11 tables:** `profiles`, `organizations`, `memberships`, `invitations`, `assistants`,
`knowledge_sources`, `documents`, `document_chunks` (`vector(768)`), `published_assistants`,
`conversations`, `messages`, `usage_events`. Every company-owned row carries `org_id`.

**Security model (RLS):**
- Members can read their org's rows; owners/admins/members can write assistants, knowledge,
  documents, chunks, published rows; viewers are read-only.
- `conversations`/`messages`/`usage_events` are **read-only to members and written only by
  the service role** from server endpoints.
- The **anon key cannot select** `documents`, `document_chunks`, `conversations`, `messages`,
  or `published_assistants` — public access must go through server endpoints.
- **Verified:** `pnpm verify:rls` passes **30/30** (same-tenant reads succeed; every
  cross-tenant read/write is denied; anon is denied on runtime tables).

**Server helpers** (`flowmind/apps/web/lib/`):
- `supabase/server.ts` — cookie-bound `@supabase/ssr` client (+ a legacy anon shim).
- `supabase/service.ts` — service-role client behind a function; `import 'server-only'`.
- `supabase/browser.ts` — anon client for auth flows.
- `supabase/database.types.ts` — generated/mirrored types.
- `auth/guards.ts` — `requireUser` / `requireOrgMember` / `requireOrgRole` /
  `requireAssistantAccess` (the only place authz is checked).
- `SUPABASE_SERVICE_ROLE_KEY` appears only in `service.ts`, which starts with
  `import 'server-only'`.

---

## 5. One consolidated backend

Everything now runs against the **single `flowmind-backend` (`dlxzeiwfebrukaefwriz`)** Supabase
project on **one Vercel project**:
- Auth + per-user assistants use the RLS-secured Phase-1 schema (`assistants`, `memberships`,
  `organizations`, …).
- The legacy publish/hosted-chat/analytics routes use `flowmind_published_assistants` and
  `flowmind_conversations`, which were recreated in this same project (migration
  `0008_legacy_publish_tables.sql`) — public demo tables, anon read/insert, no private data.

The older separate demo project is no longer referenced. (Any assistants published on the
previous live demo lived in that old project, so those `/chat/…` links reset after the switch.)

---

## 6. Design system (the redesign)

"Lumina SaaS 2.0" aesthetic applied across the app:
- **Electric Indigo** primary (`#4f46e5`), ice-white canvas (`#f7f9fb`), deep-slate text,
  **Cyber Mint** (`#10b981`) for success/online.
- **Plus Jakarta Sans** for display/headlines, **Inter** for body (via `next/font`).
- Soft ambient shadows, 12 px control / 16 px card radii, light-fill inputs with an indigo
  focus ring.
- Tokens live in `app/globals.css`; primitives in `components/ui/*`. The dark builder
  canvas keeps a categorical per-node-type palette.

---

## 7. Tech stack

- **Framework:** Next.js 15.5 (App Router, RSC), React 19, TypeScript strict.
- **Styling:** Tailwind CSS v4, Radix UI primitives, lucide-react icons, sonner toasts.
- **Canvas:** React Flow (`@xyflow/react`) v12.
- **State:** Zustand (assistants + knowledge are Supabase-backed and RLS-isolated; files in Supabase Storage).
- **Validation:** Zod (shared validators in `packages/shared`).
- **AI:** Google Gemini via **`@google/genai`** — default `gemini-2.0-flash` (configurable) for
  chat/graph and **`gemini-embedding-001`** (768-dim) for retrieval embeddings; Groq via
  **`groq-sdk`** — `openai/gpt-oss-20b` for the LLM Response node demo.
- **Backend (foundation):** Supabase (`supabase-js` + `@supabase/ssr`), Postgres + pgvector
  (HNSW), private Storage; ingestion targets a Deno Edge Function.
- **Monorepo:** pnpm workspaces + Turbo; `@flowmind/shared` package for types/constants/validators.
- **Hosting:** Vercel (Hobby) for the app; Supabase for DB/Storage/Functions.

---

## 8. Environment & configuration

Required vars (`flowmind/apps/web/.env.example`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (formerly `ANON_KEY`; new Supabase naming)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; bypasses RLS)
- `BYOK_ENCRYPTION_KEY` (server-only; 32-byte base64, `openssl rand -base64 32`) — required to
  connect a user Gemini key
- `GEMINI_API_KEY` (server-only; optional **platform** key used only when no session BYOK key
  is present)
- `GEMINI_BYOK_TTL_MINUTES` (optional, default 240), `GEMINI_GENERATION_MODEL` /
  `GEMINI_GRAPH_MODEL` (optional; default `gemini-2.0-flash`)
- `GROQ_DEMO_ENABLED` + `GROQ_API_KEY` (server-only) enable the FlowMind Groq demo for the LLM
  Response node; `GROQ_LLM_MODEL` (default `openai/gpt-oss-20b`), `GROQ_DEMO_USER_DAILY_LIMIT`
  (5), `GROQ_DEMO_GLOBAL_DAILY_LIMIT` (100), `GROQ_DEMO_MAX_PROMPT_CHARS` (6000),
  `GROQ_DEMO_MAX_OUTPUT_TOKENS` (300), `GROQ_REQUEST_TIMEOUT_MS` (30000) tune it
- `ALLOW_PLATFORM_GEMINI_LLM_FALLBACK` (default `false`) — only when exactly `true` may the LLM
  Response node use the platform `GEMINI_API_KEY`
- `NEXT_PUBLIC_APP_URL`

None of the server secrets use the `NEXT_PUBLIC_` prefix. Scripts: `pnpm dev`, `pnpm build`,
`pnpm type-check`, `pnpm test`, `pnpm db:types`, `pnpm verify:rls`.

---

## 9. What works **right now**

Run `pnpm --filter @flowmind/web dev`, open `localhost:3000` (needs Supabase env — see §8):
1. **Sign up / sign in** — `/dashboard` and `/editor` are protected; first login creates your
   personal workspace.
2. Create assistants on the dashboard (from scratch or a template); **delete** with confirmation.
3. Generate a flow from a plain-English story (heuristic in demo mode; real Gemini when connected).
4. Edit the flow on the canvas — drag nodes, wire them, edit fields in the inspector.
5. Upload `.txt/.md/.csv/.html` knowledge; it's parsed, indexed, and searchable (Test Retrieval).
6. Test the assistant in the simulator with full execution trace + variable capture
   (LLM nodes return a demo response until a Gemini key is connected).
7. **Connect Gemini (BYOK)** for the session to get real generation + LLM output; disconnect
   to return to demo mode.
8. Publish to the hosted-chat path and open `/chat/[id]`.

Your assistants **and** their knowledge are **cloud-stored and private to your account**
(RLS-isolated); uploaded files live in private Supabase Storage. Retrieval is server-side
(RLS-scoped BM25-lite) — semantic/vector search is the next step.

## 10. What does **not** work yet

- ❌ Multi-member organizations, roles, members, invitations, org switching (each user gets
  one personal workspace).
- ❌ PDF/DOCX ingestion (only `.txt/.md/.csv/.html`). Vector retrieval **is** built (Gemini
  embeddings + pgvector cosine) but only activates with a Gemini key set — otherwise retrieval
  runs the BM25 fallback.
- 🟡 Real LLM answers require either a connected Gemini key (BYOK) **or** the FlowMind Groq demo
  (`GROQ_DEMO_ENABLED` + key); otherwise a deterministic simulation is returned.
- ❌ Organization-scoped / persisted Gemini credentials; BYOK for published widgets (BYOK is
  session-only, by design).
- ❌ Authenticated server-side test-chat endpoint.
- ❌ Publish against the new schema; public `/api/chat/[publicId]`; the `/widget.js` embed;
  disable/republish; citations at runtime.
- ❌ DB-backed analytics.
- ❌ Executable `http_action`, `transform`, `validator`, `human_handoff`, `loop`, `subflow`,
  `end` nodes (defined, not implemented).

## 11. Known stubs, caveats & gotchas

- **Demo mode:** with no connected Gemini key, `/api/llm-complete` returns a canned response
  and story-gen uses the heuristic. Both are intentional graceful-degradation paths.
- **BYOK scope:** the connected key is session-only — encrypted in an HttpOnly cookie, never
  in `localStorage`/Zustand/the database, auto-expiring. It is **not** a managed secret vault,
  not organization-scoped, and not used by published widgets.
- **Story rename:** heuristic generation overwrites the assistant name with its archetype
  (e.g. "Flight Booking Assistant" → "Booking Assistant").
- **One backend:** auth, per-user assistants, AND the legacy publish/hosted-chat routes now
  all run against the **single new `flowmind-backend`** Supabase project (the legacy
  `flowmind_*` demo tables were recreated there). Deployed on one Vercel project.
- **Signup confirmation:** email auto-confirm is enabled on the project so signup logs in
  immediately (prototype-friendly).
- **parse-document scope:** text formats only; PDF/DOCX are explicitly rejected here and are
  slated for the Edge Function pipeline.
- **Node palette vs constants:** 6 executable node types; the rest are forward-looking stubs.

---

## 12. Roadmap (phased plan)

**Done**
- ✅ DB schema, RLS, Supabase clients, auth guards, type gen (`verify:rls` green).
- ✅ Auth flows + per-user personal workspace (org bootstrap on first login).
- ✅ Supabase-backed assistant CRUD; localStorage retired as source of truth.
- ✅ Knowledge ingestion → private Storage + server parse/chunk; **Gemini embeddings** on ingest.
- ✅ Server-side retrieval — **pgvector cosine** (`match_document_chunks`) with BM25 fallback.
- ✅ Real LLM answers — Gemini BYOK + **FlowMind Groq demo** (atomic per-user/global quota).
- ✅ Offline **eval harness** (RAG + workflow metrics) and **CI** (type-check · test · build).

**Next**
- Multi-member organizations — invitations, roles, member management, org switcher.
- PDF/DOCX extraction (pdfjs-dist / mammoth), ideally in a Supabase Edge Function.
- Versioned publish schema + public chat endpoint (rate-limited) + embeddable widget + rollback.
- DB-backed analytics scoped by `org_id`/`assistant_id`; optional LLM-judge eval metrics.

Acceptance is gated per phase; the previous phase's checks must stay green before the next
begins.

---

## 13. One-paragraph executive summary

FlowMind is a visual AI-assistant builder: describe a bot in plain English or drag nodes on
a canvas, ground it in your documents, test it live, and publish it as a hosted chat or web
widget. **You sign in with a real account, and your assistants are stored in Supabase and
isolated per user by Row-Level Security** — one account never sees another's history. You can
build flows, upload text knowledge, retrieve against it, and simulate conversations end-to-end.
It supports **optional session-based Gemini BYOK**: connect your own key to enable real graph
generation and LLM responses (validated server-side, encrypted in an auto-expiring HttpOnly
cookie, never persisted to the browser or database); without one, it stays fully usable in a
deterministic demo mode. **Delivered so far:** the Phase-1 database + RLS foundation, auth +
per-user assistant persistence (Phases 2–3), and Gemini BYOK. **Still ahead
(Phases 4–7):** multi-member organizations (invites/roles), cloud ingestion (PDF/DOCX →
embeddings → pgvector), server-side retrieval, and the new versioned publish + embeddable
widget path — turning the prototype into the company-safe SaaS platform the spec describes.
