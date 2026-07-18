# FlowMind — Full Product Summary

_Last updated: 2026-06-04. This document describes the **actual current state** of the
codebase, not just the target spec. Where the two differ, both are called out._

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
| Data home | Browser `localStorage` | Supabase Postgres with RLS |
| Auth | None (open app) | Supabase Auth + org membership |
| Tenancy | Single local user | Multi-tenant orgs + roles |
| Knowledge | In-browser index, `.txt/.md/.csv/.html` | Private Storage + Edge-Function ingestion, `.pdf/.docx` too |
| Retrieval | In-browser keyword/vector search | Server-side pgvector (HNSW, cosine) |
| LLM | Session **BYOK** or platform key → Gemini; else a deterministic demo **stub** | Gemini `gemini-2.5-flash` + `text-embedding-004` |
| Publish | Legacy table via anon key | New schema, unguessable public IDs, service-role runtime |

Today's app is a **fully working client-side prototype**. The **production backend
foundation (database + security) was just built in Phase 1** but is **not yet wired into
the UI**. Phases 2–7 connect them.

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
- A **live demo** runs at `flowmind-nine-tau.vercel.app`, served from a **legacy Supabase
  project** that is intentionally left untouched by the new work.

---

## 3. Feature-by-feature: what works, what's partial, what's missing

Legend: ✅ works now · 🟡 partial / prototype-grade · ❌ not built yet

### 3.1 Landing / marketing page — ✅
- Redesigned to the "Lumina SaaS" look (see §6). Hero, product-preview card, feature grid,
  header, footer. Brand is **FlowMind** throughout.
- Copy matches reality (the old "crawl websites" claim was removed).

### 3.2 Authentication & multi-tenancy — ❌ (UI) / ✅ (DB foundation)
- **No login, signup, logout, or session** in the app. Every page is open.
- **No organizations, memberships, roles, invitations, or org switcher** in the UI.
- **BUT** the entire database + security layer for this exists (Phase 1, §4): 11 tables,
  RLS on all of them, role helpers, an org-bootstrap function, and an invitations table.
  It's provisioned and verified — just not consumed by any page yet.
- Planned for **Phase 2**.

### 3.3 Dashboard & assistant management — 🟡
- **Works:** list assistants, create a new one (name + description), create from a
  template (Customer Support / Sales Qualifier / Knowledge Assistant), search, open in editor.
- **Prototype-grade:** all assistants live in `localStorage` (`flowmind-assistants` key)
  via a Zustand `persist` store. **Not** in Supabase, **not** multi-tenant, gone if you
  clear browser storage. Replacing this with Supabase-backed CRUD is **Phase 3**.

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
  `localStorage`.
- **Node types with working runtime handlers (6):** `message`, `input`, `choice`,
  `condition`, `rag_query`, `llm_response`.
- **Defined in shared constants but NOT executable** (no runtime handler, not in the
  palette): `http_action`, `transform`, `validator`, `human_handoff`, `loop`, `subflow`,
  `end`. These are placeholders for the future.
- The canvas is intentionally dark (a builder aesthetic), with a categorical color per node
  type.

### 3.6 Knowledge / ingestion — 🟡
- **Works:** upload `.txt`, `.md`, `.csv`, `.html` (≤ 4 MB). The file is parsed server-side
  (`POST /api/parse-document`, strips HTML), chunked, and indexed in an **in-browser**
  knowledge store (`flowmind-knowledge` in `localStorage`). The page lists documents with a
  chunk count + status, and has a **Test Retrieval** box that runs the search live.
- **Not supported here:** `.pdf` and `.docx` (the parse route explicitly rejects them —
  "coming in Phase 2"). No private cloud storage, no embeddings, no server-side index.
- **Target (Phase 4):** direct upload to private Supabase Storage → a **Supabase Edge
  Function** (Deno) extracts (pdfjs-dist, mammoth), chunks (~1000 tokens/150 overlap),
  embeds (Gemini `text-embedding-004`, 768-dim), and bulk-inserts `document_chunks` — all
  off-Vercel, async, with status polling.

### 3.7 Retrieval / RAG — 🟡
- **Works:** the in-browser store's `search(assistantId, query, topK)` does relevance
  scoring over the indexed chunks and returns ranked hits with scores. Verified live:
  a baggage-fee query correctly surfaced the "BAGGAGE ALLOWANCE" chunk on top.
- **Prototype-grade:** it's client-side and keyword/similarity-based, scoped by assistant
  in the browser — not pgvector.
- **Target (Phase 5):** `retrieveRelevantChunks()` calls a Postgres `match_document_chunks`
  function doing cosine similarity over an HNSW index, filtered by `org_id`/`assistant_id`
  at the SQL layer, embedding the query with Gemini `RETRIEVAL_QUERY`.

### 3.8 Test simulator — ✅ with caveat
- **Works:** the "Test" tab runs the whole graph **client-side** with a real execution
  **Trace** (per-node events + timings) and a live **Variables** panel. Message, choice
  (option matching + variable capture), input (variable capture), condition, and template
  interpolation (`{{var}}`) all execute for real. Verified end-to-end on a flight-booking
  flow.
- **Caveat:** `llm_response` nodes call `POST /api/llm-complete`, which returns a **canned
  deterministic demo response** when no Gemini key is connected (so the UI/streaming path still
  works). With a key connected (session BYOK or platform) it streams from Gemini. RAG nodes
  pull from the in-browser store. Provider/mode/model metadata rides on the response; no key
  material appears in responses or traces.
- **Target (Phase 5):** an authenticated `POST /api/assistants/[id]/test-chat` endpoint
  doing server-side retrieval + Gemini, using the live assistant graph/settings.

### 3.9 Publish / hosted chat / widget — 🟡 (legacy) / ❌ (target)
- **Works today (legacy path):** `POST /api/publish` inserts a snapshot into a **legacy**
  `flowmind_published_assistants` table using the **anon key**, generates a `pub_<id>`, and a
  hosted chat page renders at `/chat/[id]`. Legacy `conversations`/`published`/`analytics`
  routes back this.
- **Not built (target):** publish against the **new** `published_assistants` schema with
  versioning + unguessable IDs; the **public** `POST /api/chat/[publicId]` endpoint (CORS
  `*`, rate limiting, service-role runtime, citations); the self-contained **`/widget.js`**
  embeddable widget; disable/republish. This is **Phase 6**.

### 3.10 Analytics — 🟡
- A legacy analytics route/panel exists (`/api/analytics/[assistantId]`), backed by the
  legacy Supabase project.
- **Target (Phase 7):** DB-backed analytics scoped by `org_id`/`assistant_id` — conversation
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

## 5. The two Supabase projects (important)

1. **Legacy project** — powers the live demo and the current `/api/publish`,
   `/api/conversations`, `/api/analytics`, `/api/published` routes (via the anon key, legacy
   `flowmind_*` tables). Untouched by new work.
2. **New `flowmind-dev` (`dlxzeiwfebrukaefwriz`)** — holds the Phase 1 schema above. This is
   the future backend. Nothing in the running UI points at it yet.

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
- **State:** Zustand (with `persist` to localStorage — the current source of truth).
- **Validation:** Zod (shared validators in `packages/shared`).
- **AI:** Google Gemini (`@google/generative-ai`) — `gemini-2.0-flash-exp` today; spec
  targets `gemini-2.5-flash` + `text-embedding-004`.
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
- `NEXT_PUBLIC_APP_URL`

None of the server secrets use the `NEXT_PUBLIC_` prefix. Scripts: `pnpm dev`, `pnpm build`,
`pnpm type-check`, `pnpm test`, `pnpm db:types`, `pnpm verify:rls`.

---

## 9. What works **right now** (runnable today, no login)

Run `pnpm --filter @flowmind/web dev`, open `localhost:3000`:
1. Browse the redesigned landing page.
2. Create assistants on the dashboard (from scratch or a template).
3. Generate a flow from a plain-English story (heuristic in demo mode; real Gemini when connected).
4. Edit the flow on the canvas — drag nodes, wire them, edit fields in the inspector.
5. Upload `.txt/.md/.csv/.html` knowledge; it's parsed, indexed, and searchable (Test Retrieval).
6. Test the assistant in the simulator with full execution trace + variable capture
   (LLM nodes return a demo response until a Gemini key is connected).
7. **Connect Gemini (BYOK)** for the session to get real generation + LLM output; disconnect
   to return to demo mode.
8. Publish to the legacy hosted-chat path and open `/chat/[id]`.

All of this is **single-user and local** — data is in your browser.

## 10. What does **not** work yet

- ❌ Sign up / log in / sessions; any notion of a user account.
- ❌ Organizations, roles, members, invitations, org switching.
- ❌ Assistants/knowledge saved to Supabase (still localStorage).
- ❌ PDF/DOCX ingestion; cloud file storage; real embeddings; server-side pgvector retrieval.
- ❌ Real LLM answers unless a Gemini key is connected (session BYOK) or a platform key is set.
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
- **Two backends:** the running app talks to the **legacy** Supabase project; the Phase 1
  schema lives in a **separate new** project not yet wired in.
- **parse-document scope:** text formats only; PDF/DOCX are explicitly rejected here and are
  slated for the Edge Function pipeline.
- **Node palette vs constants:** 6 executable node types; the rest are forward-looking stubs.

---

## 12. Roadmap (phased plan)

- **Phase 0** — Audit + plan _(done)_.
- **Phase 1** — DB schema, RLS, Supabase clients, auth guards, type gen _(done; verify:rls 30/30)_.
- **Phase 2** — Auth flows, org onboarding, membership management, org switcher, invitations.
- **Phase 3** — Supabase-backed assistant CRUD; retire localStorage as source of truth.
- **Phase 4** — Knowledge ingestion (upload → Edge Function extract/chunk/embed → pgvector).
- **Phase 5** — Server-side retrieval + authenticated builder test-chat.
- **Phase 6** — Publish flow, public chat endpoint, embeddable widget.
- **Phase 7** — DB-backed analytics, error-code pass, copy cleanup, legacy migration, final
  security sweep.

Acceptance is gated per phase; the previous phase's checks must stay green before the next
begins.

---

## 13. One-paragraph executive summary

FlowMind is a visual AI-assistant builder: describe a bot in plain English or drag nodes on
a canvas, ground it in your documents, test it live, and publish it as a hosted chat or web
widget. **Today it runs as a polished single-user, browser-local prototype** — you can build
flows, upload text knowledge, retrieve against it, and simulate conversations end-to-end.
It supports **optional session-based Gemini BYOK**: connect your own key to enable real graph
generation and LLM responses (validated server-side, encrypted in an auto-expiring HttpOnly
cookie, never persisted to the browser or database); without one, it stays fully usable in a
deterministic demo mode. **The production backbone — a
multi-tenant Postgres schema with row-level security, storage, and server helpers — was just
built and verified in Phase 1, but is not yet connected to the UI.** The remaining work
(Phases 2–7) swaps localStorage for Supabase, adds accounts and organizations, moves
ingestion and retrieval server-side with real embeddings and pgvector, and ships a secure
publish + widget path — turning the prototype into the company-safe SaaS platform the spec
describes.
