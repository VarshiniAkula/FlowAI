# Audit 04 — API surface, server actions, LLM call sites

## Summary

| # | Route | Method(s) | Auth | Org-scoped | Calls Supabase | Calls LLM | Secret risk |
|---|---|---|---|---|---|---|---|
| 1 | `/api/llm-complete` | POST (JSON or SSE) | None | No | No | Yes (Gemini) | None — `GEMINI_API_KEY` server-only |
| 2 | `/api/generate-graph` | POST | None | No | No | Yes (Gemini) | None |
| 3 | `/api/parse-document` | POST (multipart) | None | No | No | No | None |
| 4 | `/api/publish` | POST | None | No | Yes (anon, write) | No | Anon write to public table |
| 5 | `/api/published/[id]` | GET | None | No | Yes (anon, read) | No | None |
| 6 | `/api/conversations` | POST | None | No | Yes (anon, write) | No | Anon write |
| 7 | `/api/conversations/[id]` | PATCH | None | No | Yes (anon, write) | No | Anon write |
| 8 | `/api/analytics/[assistantId]` | GET | None | No | Yes (anon, read) | No | Public read of conversation aggregates |
| 9 | `/api/health` | GET | None | n/a | Yes (anon, read) | No | None |

There are **no `'use server'` server actions** in the repo (verified by grep — file `editor-shell.tsx` and others rely on client-side store mutations instead). All server work goes through these nine route handlers.

## Per-route detail

### 1. `POST /api/llm-complete` — [route.ts](flowmind/apps/web/app/api/llm-complete/route.ts)
- Accepts `{ systemPrompt, userPrompt, temperature, stream }`.
- Streams Gemini SSE when `?stream=1` or `body.stream === true`; otherwise JSON.
- **Model: `gemini-2.0-flash-exp`** ⚠️ — does NOT match the spec target `gemini-2.5-flash`.
- Soft-fails to a stub when `GEMINI_API_KEY` is missing (returns deterministic placeholder text). Spec section Q says secrets-missing must surface as `LLM_KEY_MISSING`, not silently stub.
- No auth, no rate limit, no per-org scoping. Anyone with a URL can burn the API key.
- **No prompt centralization** — the system/user prompts come fully from the client. Spec section J mandates a server-side `lib/llm/prompt.ts`.

### 2. `POST /api/generate-graph` — [route.ts](flowmind/apps/web/app/api/generate-graph/route.ts)
- Accepts `{ story }`, returns `{ graph, source: 'gemini' | 'heuristic' }`.
- Calls `generateGraphFromStory()` in [lib/graph-generator/index.ts](flowmind/apps/web/lib/graph-generator/index.ts), which uses `gemini-2.0-flash-exp`.
- Falls back to heuristic graph generator on failure.
- No auth. Acceptable today (no DB writes), but should be rate-limited and authed once Phase 2 lands.

### 3. `POST /api/parse-document` — [route.ts](flowmind/apps/web/app/api/parse-document/route.ts)
- Multipart upload, **4 MB** limit (spec calls for 25 MB).
- Allowed extensions: `.txt`, `.md`, `.markdown`, `.csv`, `.html`, `.htm`. **No `.pdf`, no `.docx`** despite spec section I requiring both.
- Inline HTML stripping via regex. No `pdf-parse`, no `mammoth`.
- Returns the extracted text body in the response — caller (`knowledge-manager.tsx`) writes it into localStorage.
- No upload to Supabase Storage. No `documents` row created.
- Will be **deleted** in Phase 4 and replaced with `/api/knowledge/upload-url` + `/api/knowledge/ingest`.

### 4. `POST /api/publish` — [route.ts](flowmind/apps/web/app/api/publish/route.ts)
- Inserts a `flowmind_published_assistants` row with `id = pub_<nanoid(12)>`.
- Validates name/description length, graph shape, 512 KB graph limit. No auth.
- Spec section M wants `pub_<32-char-base62>` from `crypto.randomBytes`; current `nanoid(12)` gives ~12 chars of base64-ish — too guessable. Will be replaced.
- No org scoping; no role check; no version-of-existing-assistant tied to ownership.

### 5. `GET /api/published/[id]` — [route.ts](flowmind/apps/web/app/api/published/[id]/route.ts)
- Public read of the entire published row including the full graph JSON. Cached at edge (`s-maxage=300`).
- After Phase 6, the public chat endpoint will subsume this; clients shouldn't need the raw graph anymore (chat is server-rendered).

### 6. `POST /api/conversations` — [route.ts](flowmind/apps/web/app/api/conversations/route.ts)
- Anyone can insert a `flowmind_conversations` row by sending a `publishId` + `assistantId`. No verification that the publishId exists or that the assistantId matches.
- Soft-fails to an `ephemeral` local id if Supabase isn't configured.
- Will be replaced by per-message inserts inside the public chat endpoint (Phase 6) and the test-chat endpoint (Phase 5).

### 7. `PATCH /api/conversations/[id]` — [route.ts](flowmind/apps/web/app/api/conversations/[id]/route.ts)
- Bumps `turn_count`, sets `status = 'completed'` + `ended_at` on `done`. Anyone with an id can mutate the row.
- Replaced by Phase 6 (writes happen server-side from the chat endpoint via service role).

### 8. `GET /api/analytics/[assistantId]` — [route.ts](flowmind/apps/web/app/api/analytics/[assistantId]/route.ts)
- Returns last-500 conversations aggregate for an assistant id. No auth → leak if anon RLS is permissive.
- Phase 7 replaces with org+assistant-scoped analytics queries gated by `requireAssistantAccess(..., 'viewer')`.

### 9. `GET /api/health` — [route.ts](flowmind/apps/web/app/api/health/route.ts)
- Pings Supabase via a count query. Public OK.

## LLM call inventory

Every Gemini SDK initialization in the active app:

| File:line | Model | Direct or via /api/llm-complete? |
|---|---|---|
| [app/api/llm-complete/route.ts](flowmind/apps/web/app/api/llm-complete/route.ts) (`new GoogleGenerativeAI(apiKey)`) | `gemini-2.0-flash-exp` | Direct |
| [lib/graph-generator/index.ts:48](flowmind/apps/web/lib/graph-generator/index.ts#L48) (`new GoogleGenerativeAI(apiKey)`) | `gemini-2.0-flash-exp` | Direct |

Two **independent** Gemini client instantiations exist. Spec section U.6 + Phase 5 acceptance check require all Gemini calls to flow through `lib/llm/gemini.ts` — both call sites must be refactored.

The browser-side runtime in [lib/runtime/services.ts](flowmind/apps/web/lib/runtime/services.ts) calls Gemini only via `fetch('/api/llm-complete', ...)`, so the API key never reaches the client. ✓

## Secrets handling

| Var | Where read | Bundle risk |
|---|---|---|
| `GEMINI_API_KEY` | API routes only (server). | None — `process.env.GEMINI_API_KEY`, server-only. ✓ |
| `NEXT_PUBLIC_SUPABASE_URL` | [lib/supabase/server.ts](flowmind/apps/web/lib/supabase/server.ts), `app/layout.tsx`, `app/sitemap.ts`, `app/robots.ts`. | `NEXT_PUBLIC_*` — designed for client. OK. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | [lib/supabase/server.ts](flowmind/apps/web/lib/supabase/server.ts). | `NEXT_PUBLIC_*` — designed for client. OK. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Not used anywhere.** | Phase 1 will introduce it; must be guarded by `import 'server-only'`. |

## Defects to call out (carry into Phase 0 → relevant later phase)

- D1 (Phase 4): `parse-document` claims unsupported types in the error message ("PDF/DOCX coming in Phase 2"); copy is misleading. UI promises PDF crawl too — see audit 05.
- D2 (Phase 5): two duplicate Gemini SDK initializations.
- D3 (Phase 5): wrong model id everywhere (`gemini-2.0-flash-exp` ≠ spec `gemini-2.5-flash`).
- D4 (Phase 6): `publish_id` randomness too low (`nanoid(12)`).
- D5 (Phase 1+): `lib/supabase/server.ts` lacks `import 'server-only'`.
- D6 (Phase 7): silent stub in `llm-complete` masks missing keys, contradicting `LLM_KEY_MISSING`.
