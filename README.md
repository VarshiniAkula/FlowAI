# FlowMind

**FlowMind is a visual builder for AI chat assistants.** Describe an assistant in plain
English or drag nodes onto a canvas to design a conversation flow, ground its answers in
your own documents (RAG), test it in a live simulator, and publish it as a hosted chat page
or embeddable widget.

> 📦 **The active product lives in [`flowmind/`](flowmind/).** Everything you build, run, or
> deploy is there.

---

## 🚧 Current prototype status

**FlowMind is an early-stage work in progress — not production-ready.** Today it runs as a
working **single-user, browser-local prototype**. The production, multi-tenant backend is
being built phase by phase; the database + security foundation exists but is **not yet wired
into the UI**. Expect breaking changes.

| Capability | Status |
|---|---|
| Visual builder (Story → Canvas → Test) | ✅ Working (client-side) |
| Knowledge upload + retrieval | 🟡 Working for `.txt / .md / .csv / .html` (in-browser index) |
| LLM answers | 🟡 Real via **session Gemini BYOK** (or a platform key); deterministic demo stub otherwise |
| Gemini BYOK (bring your own key) | ✅ Connect a key per browser session — validated server-side, encrypted in an HttpOnly cookie, auto-expiring |
| Database schema + Row-Level Security | ✅ Built & verified, **not yet used by the UI** |
| Accounts, organizations, multi-tenancy | ❌ Not built yet |
| Cloud ingestion (PDF/DOCX, embeddings, pgvector) | ❌ Not built yet |
| Publish + public chat + embeddable widget | ❌ Not built yet |

Full, honest breakdown: **[docs/PRODUCT-SUMMARY.md](docs/PRODUCT-SUMMARY.md)**.

---

## ✅ Working now

Runs entirely on your machine — no account, no cloud, data stored in your browser:

- **Landing page** and dashboard.
- **Story Builder** — describe an assistant in plain English → a working flow (deterministic
  heuristic in demo mode; real Gemini generation when a key is connected).
- **Visual Canvas** — drag nodes, wire them, edit each node in the inspector, auto-saved.
  Executable node types: message, input, choice, condition, RAG query, LLM response.
- **Knowledge** — upload `.txt / .md / .csv / .html`; it's parsed, chunked, indexed, and
  searchable (with a built-in retrieval tester).
- **Test simulator** — run the whole flow with a live execution trace and variable capture.
  LLM nodes return a deterministic demo response until a Gemini key is connected.
- **Gemini BYOK** — click **Connect Gemini** (dashboard / editor) to add your own key for the
  session. It's validated server-side, encrypted in an HttpOnly cookie, auto-expires, and is
  never stored in the browser or database. Without a key, FlowMind stays fully usable in demo
  mode.

## 🗺️ Roadmap

Backend foundation (schema, Row-Level Security, server helpers) is complete and verified but
not yet connected to the UI. Remaining phases wire it in:

| Phase | Scope | State |
|---|---|---|
| 0 | Audit & plan | ✅ Done |
| 1 | Database schema, RLS, Supabase clients, auth guards | ✅ Done (verify:rls green) |
| 2 | Auth flows, organizations, membership management | ⬜ Planned |
| 3 | Supabase-backed assistant persistence (retire localStorage) | ⬜ Planned |
| 4 | Cloud ingestion (upload → extract → chunk → embed → pgvector) | ⬜ Planned |
| 5 | Server-side retrieval + authenticated test chat | ⬜ Planned |
| 6 | Publish flow, public chat endpoint, embeddable widget | ⬜ Planned |
| 7 | Analytics, error-code pass, copy cleanup, final security sweep | ⬜ Planned |

Details: [docs/flowmind-spec.md](docs/flowmind-spec.md) (spec),
[docs/flowmind-prompt-pack.md](docs/flowmind-prompt-pack.md) (phased plan).

---

## Repository layout

```
FlowMind/                   ← repository root
├── docs/                   ← spec, phased plan, audit, product summary
└── flowmind/               ← THE PRODUCT (Next.js monorepo: pnpm + Turbo)
    ├── apps/web/           ← the Next.js 15 app you run
    ├── packages/shared/    ← shared TS types, node constants, Zod validators
    └── supabase/           ← migrations + config (backend foundation)
```

## Tech stack

Next.js 15 (App Router, RSC) · React 19 · TypeScript (strict) · Tailwind CSS v4 ·
React Flow v12 · Zustand · Zod · Google Gemini · Supabase (Postgres + pgvector, Auth,
Storage) · pnpm workspaces + Turbo.

---

## Setup

### Prerequisites
- **Node.js 20+**
- **pnpm 10+** — `npm install -g pnpm`
- (Optional, for the backend) a free **Supabase** project and the
  [Supabase CLI](https://supabase.com/docs/guides/cli); a **Gemini API key** for real LLM output.

### 1. Run the prototype (no backend needed)
```bash
git clone https://github.com/VarshiniAkula/FlowMind.git
cd FlowMind/flowmind
pnpm install
pnpm --filter @flowmind/web dev
# open http://localhost:3000
```
You can build assistants, generate flows, upload text knowledge, and run the simulator
immediately. Data lives in your browser; LLM answers are stubbed until you add a Gemini key.

### 2. (Optional) Enable real LLM output + the backend
```bash
cp flowmind/apps/web/.env.example flowmind/apps/web/.env.local
```
Fill in `flowmind/apps/web/.env.local`:

| Variable | Needed for | Notes |
|---|---|---|
| `BYOK_ENCRYPTION_KEY` | Gemini BYOK | **Server-only.** 32 bytes base64 — generate with `openssl rand -base64 32`. Required to connect a key. |
| `GEMINI_API_KEY` | Optional platform key | Server-only. Used only when no session BYOK key is present. |
| `GEMINI_BYOK_TTL_MINUTES` | BYOK session length | Optional, default `240` (4h). |
| `GEMINI_GENERATION_MODEL` / `GEMINI_GRAPH_MODEL` | Model selection | Optional; default `gemini-2.0-flash`. Setting one applies to both. |
| `NEXT_PUBLIC_SUPABASE_URL` | Backend foundation | From your Supabase project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Backend foundation | Publishable/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend foundation | **Server-only; bypasses RLS; never commit** |
| `NEXT_PUBLIC_APP_URL` | Links / redirects | e.g. `http://localhost:3000` |

None of the server secrets use the `NEXT_PUBLIC_` prefix.

Apply the database schema to your own Supabase project and verify tenant isolation:
```bash
cd flowmind
supabase link --project-ref <your-project-ref>
supabase db push                       # applies supabase/migrations/*
cd apps/web
pnpm verify:rls                         # asserts every cross-tenant access is denied
```

> `.env.local` is gitignored. Never commit it — `SUPABASE_SERVICE_ROLE_KEY` bypasses
> Row-Level Security and must stay server-side only.

### Scripts (`flowmind/apps/web`)
| Script | Does |
|---|---|
| `pnpm dev` | Run the app |
| `pnpm build` | Production build |
| `pnpm type-check` | TypeScript check (`tsc --noEmit`) |
| `pnpm db:types` | Regenerate Supabase types |
| `pnpm verify:rls` | Cross-tenant RLS test suite (needs Supabase env) |
| `pnpm test` | Unit + route tests (Vitest) |

---

## Contributing / status

This is an actively-changing prototype maintained as a phased build (see the roadmap). The
`main` branch is the source of truth. Issues and structure may shift between phases.
