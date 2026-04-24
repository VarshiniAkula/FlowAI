# FlowMind Implementation Plan (Phases 1–7)

All paths are relative to repo root unless noted. The active app lives at `flowmind/apps/web/`. New `supabase/` lives at `flowmind/supabase/` (one Supabase project per monorepo).

Conventions:
- `+` = create
- `~` = modify
- `-` = delete

---

## Phase 1 — Foundation

### Files to create
- `+ flowmind/supabase/config.toml` — `[db.extensions] vector = true; pgcrypto = true; pg_trgm = true`
- `+ flowmind/supabase/migrations/0001_init.sql` — every table from spec C in dependency order, plus `set_updated_at()` trigger function
- `+ flowmind/supabase/migrations/0002_indexes.sql` — HNSW + B-tree + uniques per spec D
- `+ flowmind/supabase/migrations/0003_rls.sql` — `is_org_member()`, `org_role()`, all policies per spec E
- `+ flowmind/supabase/migrations/0004_storage.sql` — `knowledge-files` private bucket + `storage.objects` RLS
- `+ flowmind/supabase/migrations/0005_invitations.sql` — `invitations` table + RLS (owner/admin can insert+select+delete; anon can select-by-token-only via the accept-invite endpoint, or done entirely via service role from the Next.js route)
- `+ flowmind/supabase/migrations/0006_bootstrap_org.sql` — `bootstrap_organization(p_name text, p_slug text)` SECURITY DEFINER function per Q2 resolution
- `+ flowmind/apps/web/lib/supabase/server.ts` — **rewrite** of existing file: cookie-bound `@supabase/ssr` client, `import 'server-only'`
- `+ flowmind/apps/web/lib/supabase/service.ts` — service-role client behind a `createServiceClient()` function, `import 'server-only'`
- `+ flowmind/apps/web/lib/supabase/browser.ts` — anon client for auth flows
- `+ flowmind/apps/web/lib/supabase/database.types.ts` — generated; committed
- `+ flowmind/apps/web/lib/auth/guards.ts` — `requireUser()`, `requireOrgMember()`, `requireOrgRole()`, `requireAssistantAccess()`
- `+ flowmind/apps/web/scripts/verify-rls.ts` — cross-org assertion suite
- `+ flowmind/apps/web/.env.example` — every var from spec section A with comments
- `+ README.md` (repo root) — "Local Supabase" section per Phase 1 task 1

### Files to modify
- `~ flowmind/apps/web/package.json` — add `@supabase/ssr`, drop legacy direct usage where superseded; add scripts: `db:types`, `db:reset`, `verify:rls`
- `~ flowmind/package.json` — pass-throughs if needed

### Replaced/removed
- `~ flowmind/apps/web/lib/supabase/server.ts` — current anon-key file is **replaced** by the `@supabase/ssr` cookie-bound version above. Existing routes that import `getSupabaseServerClient`/`isSupabaseConfigured` keep compiling because the public chat / publish / conversations routes will be rewritten in later phases; for Phase 1 the helper exports those names too as a thin shim, then the shim is removed in Phase 6 once those routes are rebuilt.

### Risks / unknowns
- **Fresh Supabase project (Q1 resolved)**: Phase 1 targets a brand-new `flowmind-dev` Supabase project. The legacy Supabase project powering `flowmind-nine-tau.vercel.app` is NOT touched. `.env.local` holds the new project's URL + keys; `.env.local` is gitignored. `.env.example` lists the variable names only.
- **`@supabase/ssr` cookie API breaking changes**: pinning `@supabase/ssr` to a known-good minor version. The middleware split (request-cookie pass-through vs response cookie set) is the most common bug source.
- **SECURITY DEFINER hygiene**: `bootstrap_organization` is the only SECURITY DEFINER function approved. Migration 0006 must include `SET search_path = public`, an `auth.uid() IS NOT NULL` check, `REVOKE EXECUTE FROM public`, and `GRANT EXECUTE TO authenticated` — verified in the verify-rls script.

---

## Phase 2 — Auth + organizations

### Files to create
- `+ flowmind/apps/web/middleware.ts` — session refresh + protected-route redirect
- `+ flowmind/apps/web/app/(auth)/login/page.tsx`
- `+ flowmind/apps/web/app/(auth)/signup/page.tsx`
- `+ flowmind/apps/web/app/(auth)/logout/route.ts`
- `+ flowmind/apps/web/app/onboarding/page.tsx` + `actions.ts` — calls `supabase.rpc('bootstrap_organization', { p_name, p_slug })` from a server action with the user-scoped client (Q2)
- `+ flowmind/apps/web/app/accept-invite/page.tsx` + `actions.ts` — Q3: validates `token`, requires sign-in or sign-up, inserts membership, stamps `accepted_at`
- `+ flowmind/apps/web/lib/db/invitations.ts` — typed CRUD for invites (create with random 32-char base62 token, list pending for org, revoke, accept). Email send-site is a `TODO(phase-7)` comment.
- `+ flowmind/apps/web/components/org/invite-member-form.tsx` — form + post-submit display of the copyable invite URL (no email send)
- `+ flowmind/apps/web/app/(app)/layout.tsx` — wraps the authenticated shell; replaces or wraps `app/layout.tsx` for the protected segment
- `+ flowmind/apps/web/app/(app)/settings/organization/page.tsx` (members, role changes, transfer ownership) + `actions.ts`
- `+ flowmind/apps/web/components/org/org-switcher.tsx`
- `+ flowmind/apps/web/lib/auth/active-org.ts` — `getActiveOrg()` cookie reader/validator
- `+ flowmind/supabase/migrations/0007_profiles_trigger.sql` (renumbered — 0005/0006 land in Phase 1)

### Files to modify
- `~ flowmind/apps/web/app/layout.tsx` — strip authenticated chrome where it clashes with `(app)/layout.tsx`
- `~ flowmind/apps/web/components/editor/editor-shell.tsx` — header gets the org switcher (cosmetic only — assistant CRUD still localStorage in this phase per Phase 2 non-goals)
- `~ README.md` — "Creating your first account"

### Replaced/removed
- None — UI surfaces stay localStorage-backed until Phase 3.

### Risks / unknowns
- **Onboarding transaction (Q2 resolved)**: server action calls `supabase.rpc('bootstrap_organization', { p_name, p_slug })` shipped in Phase 1. No new SECURITY DEFINER allowed in Phase 2.
- **Invite UX (Q3 resolved)**: `invitations` table-backed (schema in Phase 1), no email send in Phase 2. UI displays the copyable invite URL after creating the row. Email integration deferred to Phase 7.
- **Profile fields (Q7 still open)**: signup form currently planned to capture only email + password. If Q7 confirms `full_name` capture, add a single field to the signup form.

---

## Phase 3 — Assistant persistence

### Files to create
- `+ flowmind/apps/web/lib/db/assistants.ts` — typed CRUD using user-scoped client + guards
- `+ flowmind/apps/web/app/(app)/assistants/actions.ts` — server actions (`createAssistantAction`, etc.) wrapping CRUD with Zod
- `+ flowmind/apps/web/lib/templates/index.ts` — extracted from inline `TEMPLATES` in dashboard page
- `+ flowmind/apps/web/components/dashboard/import-local-assistants.tsx` — one-time migration UI (per spec P)
- `+ flowmind/apps/web/app/(app)/dashboard/import-local-assistants/route.ts` (or server action) — server-side insert path

### Files to modify
- `~ flowmind/apps/web/app/dashboard/page.tsx` — convert to server component; delete `useAssistantStore` reads; render `listAssistants(activeOrg.id)`. Delete the inline `TEMPLATES` array (moved to `lib/templates/`).
- `~ flowmind/apps/web/components/editor/editor-shell.tsx` — load the assistant from server (parent server component fetches + passes), debounced save via server action, "Saved/Saving/Unsaved" indicator. Replace `useAssistantStore` reads with a client-side cache fed from the server prop.
- `~ flowmind/apps/web/app/editor/[assistantId]/*/page.tsx` — convert each tab page to server-fetch the assistant once and pass into the existing client UI.
- `~ flowmind/apps/web/components/canvas/flow-canvas.tsx` and inspector forms — read graph from a new client-side `useAssistantGraph(assistantId)` hook backed by sessionStorage draft + server snapshot, not from `useAssistantStore`.
- `~ flowmind/apps/web/components/chat/hosted-chat.tsx` — the `else` branch that read `useAssistantStore` for non-`pub_*` ids is no longer reachable in production (test chat moves to Phase 5 endpoint); delete the localStorage path **or** guard it under `process.env.NODE_ENV === 'development'` for the in-editor preview pending Phase 5. Decision to be made in Phase 3 task 8 — see open question Q4.

### Replaced/removed
- `- flowmind/apps/web/stores/assistant-store.ts` — **deleted** after the import-legacy flow ships and after every importer is gone. Until then, kept but only the import-flow imports it.
- `~` All `useAssistantStore` callers refactored to either server-rendered props or the new graph hook.
- Inline `TEMPLATES` in dashboard — removed.

### Risks / unknowns
- **Graph save fan-out**: the canvas updates `useGraphStore` on every node drag. The debounced save needs to flush graph + node positions but skip ephemeral state (`selectedNodeId`, `activeNodeId`). Spec G7 says ~1 save / 2s; implementing this with `useEffect` + `setTimeout` is fine, but need to ensure unmount flushes pending edits. Risk of losing the last 0–2s of edits on tab close — sessionStorage draft (Phase 3 task 4) covers this.
- **React 19 + zustand persist** comments in current code (`knowledge-manager.tsx:27`, `editor-shell.tsx:98`, `analytics-panel.tsx:66`) reference snapshot-stability bugs. Removing persist may resolve these incidentally; keep an eye on `useSyncExternalStore` warnings during refactor.

---

## Phase 4 — Knowledge ingestion (Supabase Edge Function architecture)

Q5 resolution: heavy ingestion runs **off Vercel** in a Supabase Edge Function (Deno). The Next.js route is a thin invoker that returns 202 in < 1s. **No extraction/chunking/embedding code lives in the Next.js app.**

### Files to create — Next.js side (thin invoker only)
- `+ flowmind/apps/web/app/api/knowledge/upload-url/route.ts` — POST: validate + signed upload URL + insert pending `documents`/`knowledge_sources` rows
- `+ flowmind/apps/web/app/api/knowledge/ingest/route.ts` — POST: validates auth + role, sets `documents.status='processing'`, fires `supabase.functions.invoke('ingest-document', { body: { documentId } })`, returns 202. Must complete in < 1s.
- `+ flowmind/apps/web/lib/ingest/process.ts` — < 30 LOC thin client. Single export `dispatchIngest(documentId)` wrapping `functions.invoke`. Banner comment forbids extraction/chunking/embedding logic.
- `+ flowmind/apps/web/scripts/verify-ingest.ts` — fixture upload + cross-org isolation + < 1s 202 latency assertion + 25 MB PDF readiness within 3 min
- `+ flowmind/apps/web/scripts/fixtures/sample.md` — for verify-ingest
- `+ flowmind/apps/web/scripts/fixtures/sample-25mb.pdf` (or generated at test time) — for the latency assertion

### Files to create — Edge Function side (single source of truth)
- `+ flowmind/supabase/functions/ingest-document/index.ts` — Deno entry; flow controller
- `+ flowmind/supabase/functions/ingest-document/_lib/extract.ts` — dispatch by extension. PDF via `pdfjs-dist` (WASM), DOCX via `npm:mammoth`, HTML via `npm:node-html-parser` or `deno-dom`, `.txt`/`.md`/`.csv` raw UTF-8.
- `+ flowmind/supabase/functions/ingest-document/_lib/chunk.ts` — `npm:gpt-tokenizer`, 1000-token target, 150-token overlap, paragraph/sentence breaks, ≥50 char skip
- `+ flowmind/supabase/functions/ingest-document/_lib/embed.ts` — direct `fetch` to `text-embedding-004:batchEmbedContents`, batches of 100, exp backoff, dim=768 verification, fail-loud on missing `GEMINI_API_KEY`
- `+ flowmind/supabase/functions/ingest-document/_lib/db.ts` — service-role client + bulk insert helpers + status updates + cleanup
- `+ flowmind/supabase/functions/ingest-document/deno.json` — imports map for npm: specifiers and pdfjs-dist
- `+ flowmind/supabase/.env.local.example` — `GEMINI_API_KEY=...` template; the real `.env.local` is gitignored

### Files to modify
- `~ flowmind/supabase/config.toml` — `[functions.ingest-document] verify_jwt = false` (security comes from the Next.js route's auth check before invoking)
- `~ flowmind/apps/web/components/knowledge/knowledge-manager.tsx` — replace `useKnowledgeStore` reads with server-fetched documents prop; delete inline upload that hit `/api/parse-document`; add status polling every 3s while pending/processing; cascade-delete confirmation
- `~ flowmind/apps/web/app/editor/[assistantId]/knowledge/page.tsx` — convert to server component, fetch `documents` for assistant, pass into manager
- `~ flowmind/apps/web/.env.example` + `README.md` — `GEMINI_API_KEY` setup (note: also set as Supabase secret `supabase secrets set GEMINI_API_KEY=...`); embedding-dimensions warning; "Local Edge Functions" section explaining `supabase functions serve ingest-document --env-file ./supabase/.env.local`
- `~ flowmind/apps/web/components/landing/hero.tsx` — remove "Upload PDFs, crawl websites" claim
- `~ flowmind/packages/shared/src/types/assistant.ts` — `KnowledgeSource.type` union to `'file' | 'url' | 'text' | 'api'`; status enum to `'pending' | 'processing' | 'ready' | 'failed'`

### Replaced/removed
- `- flowmind/apps/web/app/api/parse-document/route.ts` — superseded by the upload-url + ingest pair
- `- flowmind/apps/web/lib/knowledge/store.ts` — superseded; remove after import-legacy path is in place
- `- flowmind/apps/web/lib/knowledge/search.ts` — superseded by Phase 5 retrieval
- `- flowmind/apps/web/lib/knowledge/chunker.ts` — superseded by Edge Function chunker
- **No ingestion libraries in the Next.js app**: `pdfjs-dist`, `pdf-parse`, `mammoth`, `node-html-parser`, `gpt-tokenizer`, `tiktoken` MUST NOT appear in `flowmind/apps/web/package.json`. CI grep guard enforces this.

### Risks / unknowns
- **`pdfjs-dist` in Deno**: import the legacy build or the worker-less ESM build to avoid Web Worker/canvas dependencies. Test on a 25 MB scanned PDF (worst case for memory).
- **Edge Function cold start**: first invocation after deploy can take 3–5s. The Next.js route returns 202 immediately, so user-facing latency is unaffected; the only impact is the time-to-`ready`. Acceptance check (3 min for 25 MB) leaves plenty of headroom.
- **Edge Function concurrency**: Supabase free tier limits concurrent function invocations. Document the limit in README "Known limitations".
- **Storage signed-upload-URL TTL**: Supabase signed upload URLs default to 2h. Document client-side fallback if upload races past TTL.
- **Local dev requires `supabase functions serve` running in a separate terminal**: README must call this out. Add a `pnpm dev:functions` script (root) that wraps it.
- **Function secrets**: `GEMINI_API_KEY` must be set both as a Supabase Function secret (`supabase secrets set`) and locally in `supabase/.env.local`. README documents both.

---

## Phase 5 — Retrieval + builder test chat

### Files to create
- `+ flowmind/supabase/migrations/0006_match_function.sql` — `match_document_chunks(p_org_id, p_assistant_id, p_query_embedding, p_match_count)`
- `+ flowmind/apps/web/lib/retrieval/retrieve.ts` — `retrieveRelevantChunks({ orgId, assistantId, query, topK })`
- `+ flowmind/apps/web/lib/llm/prompt.ts` — grounded prompt template + `[doc:N]` parser
- `+ flowmind/apps/web/lib/llm/gemini.ts` — single `generateAnswer({ systemPrompt, userMessage, context })`; uses `gemini-2.5-flash`; 30s timeout, retry, safety-block handling
- `+ flowmind/apps/web/app/api/assistants/[assistantId]/test-chat/route.ts`
- `+ flowmind/apps/web/scripts/verify-retrieval.ts` — known-fact assertion + cross-org check

### Files to modify
- `~ flowmind/apps/web/lib/runtime/services.ts` — `createSimulatorServices(...)` retrieval branch deleted (no in-browser BM25). Test chat now exclusively goes through the new endpoint. The runtime LLM call also routes through `lib/llm/gemini.ts`-backed endpoint, eliminating the second Gemini SDK init.
- `~ flowmind/apps/web/app/api/llm-complete/route.ts` — refactor to import from `lib/llm/gemini.ts`; drop the silent stub branch (replaced by `LLM_KEY_MISSING` error code per spec Q); fix model id to `gemini-2.5-flash`
- `~ flowmind/apps/web/app/editor/[assistantId]/test/page.tsx` and `components/simulator/simulator.tsx` — call new `/api/assistants/[id]/test-chat`; render citation chips
- `~ flowmind/apps/web/lib/graph-generator/index.ts` — replace direct `new GoogleGenerativeAI(...)` with the centralized helper from `lib/llm/gemini.ts` and bump model id

### Replaced/removed
- The in-browser retrieval path in `lib/runtime/services.ts` is gone. The `RAG Query` node behavior changes from "search localStorage" to "call retrieve endpoint" — node handler in `lib/runtime/handlers.ts` updated accordingly.

### Risks / unknowns
- **Citation parsing fragility**: model may emit `[doc: 1]`, `[doc:1, doc:2]`, etc. Parser must be permissive (regex `\[doc:\s*(\d+)\s*\]`) and dedupe.
- **Simulator behavior in editor**: the editor renders a "preview" chat without the `pub_*` flow. With server-side retrieval, the preview must be authenticated (it is, since it's inside `(app)/`), so the existing `pub_*` branch in `hosted-chat.tsx` is no longer needed for in-editor preview.

---

## Phase 6 — Publish + public chat + widget

### Files to create
- `+ flowmind/apps/web/lib/publish/public-id.ts` — `pub_<32-char-base62>` via `crypto.randomBytes`
- `+ flowmind/apps/web/lib/publish/actions.ts` — `publishAssistant`, `unpublishAssistant`, `republishAssistant` server actions
- `+ flowmind/apps/web/app/api/chat/[publicId]/route.ts` — public chat endpoint with CORS, rate limit, OPTIONS preflight
- `+ flowmind/apps/web/lib/rate-limit/index.ts` — in-memory + DB-backed limiter (TODO: Upstash later)
- `+ flowmind/apps/web/app/widget.js/route.ts` — replaces `public/widget.js` so we can serve with proper headers (`Content-Type`, `Cache-Control`, CORS)
- `+ flowmind/apps/web/app/(app)/assistants/[id]/deploy/page.tsx` — deploy panel (server component) — supersedes the editor sub-route's deploy page
- `+ flowmind/apps/web/scripts/verify-publish.ts`

### Files to modify
- `~ flowmind/apps/web/app/chat/[publicId]/page.tsx` — reshape route to take `publicId` (currently named `[assistantId]`); server-fetches name/tone/published-status only; client chat hits `/api/chat/[publicId]`
- `~ flowmind/apps/web/app/chat/[publicId]/chat-client.tsx` — new server-driven chat client with `sessionId` in `sessionStorage`, citations rendering
- `~ flowmind/apps/web/components/chat/hosted-chat.tsx` — **delete** the in-browser runtime path; client becomes a thin chat shell that POSTs to `/api/chat/[publicId]`. Remove `useAssistantStore` import entirely.
- `~ flowmind/apps/web/components/deploy/deploy-panel.tsx` — copy snippet uses `data-flowmind-id` (matches spec M); remove `data-flowmind-host`/`data-flowmind-theme` (or treat as optional)
- `~ flowmind/apps/web/app/editor/[assistantId]/deploy/page.tsx` — server-fetch `published_assistants` history for this assistant; pass to deploy panel
- `~ flowmind/apps/web/lib/runtime/services.ts` — public chat path no longer instantiates `createSimulatorServices`; that helper is now only for the editor preview (which is also being removed in this phase since test chat covers it)

### Replaced/removed
- `- flowmind/apps/web/public/widget.js` — replaced by route handler
- `- flowmind/apps/web/app/api/publish/route.ts` — superseded by server action
- `- flowmind/apps/web/app/api/published/[id]/route.ts` — superseded by server-rendered chat page (no client needs the raw graph)
- `- flowmind/apps/web/app/api/conversations/route.ts`
- `- flowmind/apps/web/app/api/conversations/[id]/route.ts`
- DB: drop `flowmind_published_assistants` and `flowmind_conversations` legacy tables (or keep read-only for archive); add a final cleanup migration `0007_drop_legacy.sql` once data is migrated/discarded

### Risks / unknowns
- **Disabling cache invalidation**: `/api/published/[id]` currently sets `s-maxage=300`. The new publish flow must avoid edge caching the "is this still published?" decision, or "Disable" won't take effect for up to 5 minutes (acceptance check 6.4 fails). The new public chat endpoint should be `Cache-Control: no-store` for the message POST and the page-level fetch should use `revalidate = 0`.
- **In-memory rate limiter on Vercel**: serverless functions are stateless — an in-memory map resets on every cold start. MVP plan: layer 2 = DB-backed bucket per (IP+sessionId) using a small `rate_limit_buckets` table; document Upstash as the upgrade.
- **Widget script bundling**: spec says "self-contained JS (bundle any deps)". Serving from a route handler means we either ship a hand-rolled vanilla file (current pattern) or pre-build with esbuild and inline. Recommend hand-rolled vanilla for MVP — current `public/widget.js` is already 183 lines of plain JS.
- **CORS on the chat page**: the page itself doesn't need CORS (it's same-origin from the widget iframe perspective), but `X-Frame-Options` must be unset/`SAMEORIGIN` overridden for the `?embed=1` variant. Need to send `Content-Security-Policy: frame-ancestors *` from the chat page when `embed=1`.

---

## Phase 7 — Analytics, errors, copy, migration, security sweep

### Files to create
- `+ flowmind/apps/web/app/(app)/analytics/page.tsx` — top-level analytics shell (per assistant via query param or per-assistant route)
- `+ flowmind/apps/web/lib/db/analytics.ts` — DB queries (`conversationCounts`, `topQuestions`, `failedAnswerRate`, `citationRate`)
- `+ flowmind/apps/web/lib/errors/index.ts` — `AppError` class + code enum + `toResponse()` helper for routes/actions
- `+ docs/copy-audit.md` — list of every changed copy claim and why
- `+ docs/implementation-summary.md` — final deliverable: file-change list per phase + acceptance-criterion → file/function mapping

### Files to modify
- `~ flowmind/apps/web/components/analytics/analytics-panel.tsx` — point at new DB-backed queries; render top-questions, citation rate, failed-answer rate
- `~ flowmind/apps/web/app/editor/[assistantId]/analytics/page.tsx` — server-fetch analytics, pass to panel
- `~` Every API route + server action — wrap return values with the `AppError` shape `{ error: { code, message } }`
- `~ flowmind/apps/web/components/landing/hero.tsx` — remove "crawl websites", PDF-OCR claims, hybrid-search claim if not implemented
- `~ flowmind/apps/web/app/page.tsx` — landing page copy
- `~ flowmind/apps/web/components/editor/editor-shell.tsx` — empty-state copy
- `~ README.md` (root) — full final pass: "What FlowMind is", local setup, end-to-end flow, verify scripts, Vercel deploy, supported file types, known limitations

### Risks / unknowns
- **"Top user questions" privacy**: lowercase-normalized group-by means full message bodies sit in analytics. For multi-tenant SaaS, scope and retention are open questions; document as known limitation for MVP.
- **Failed-answer detection**: spec uses metadata flag set by the LLM endpoint when it emits the canned "I don't have enough information…" text. Implementation must set this flag in `messages.metadata` at write time, not via post-hoc string matching, so analytics queries are cheap.
- **Bundle-grep for secrets**: `npm run build` must be run from `flowmind/apps/web/` and the grep must include `.next/server/` AND `.next/static/`. Worth scripting as `npm run verify:bundle`.

---

## Cross-phase risks not addressed elsewhere

1. **Existing `flowmind_published_assistants` data**: there's a deployed Vercel app with real (or test) publishes. Treat as discardable for MVP migration. Confirmed in Q1.
2. **Two-app monorepo turbo cache**: the `apps/*` glob would pick up new packages cleanly, but we need to ensure `verify:*` scripts run from `flowmind/apps/web/` and not via `turbo run` (turbo would cache them and not re-execute against a live DB).
3. **Tailwind 4 beta**: app uses `tailwindcss@^4.0.0-beta.8`. New auth/onboarding pages will need to follow whatever Tailwind 4 conventions are already established. No spec impact, but worth flagging.
4. **React 19 + zustand persist instability**: tracked in audit 02. Removing persist (Phase 3, Phase 4) likely resolves it. If not, the `import-legacy` flow in Phase 3 may need an alternative read path.
5. **Vercel function timeout (Q5 resolved)**: ingestion no longer runs on Vercel — it lives in a Supabase Edge Function (Deno). The Next.js `/api/knowledge/ingest` route is a thin invoker that returns 202 in < 1s. Risk shifted to Edge Function cold-start + concurrency; tracked in the Phase 4 risks section above.
6. **Cookie domain across subdomains**: production deploy at `flowmind-nine-tau.vercel.app` — `flowmind-active-org` cookie scope is fine for a single domain. If a custom domain is added, document the cookie domain choice.
