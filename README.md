# FlowMind

> ⚠️ **Work in progress.** FlowMind is under active development and **not production-ready**.
> Today it runs as a working **single-user, browser-local prototype**; the multi-tenant
> Supabase backend is being wired in phase by phase. Expect breaking changes.

**FlowMind is a visual builder for AI chat assistants.** Describe an assistant in plain
English or drag nodes onto a canvas to design a conversation flow, ground its answers in your
own uploaded documents (RAG), test it in a live simulator, and publish it as a hosted chat
page or embeddable widget.

The end goal is a **company-safe, multi-tenant SaaS platform** (organizations, private
knowledge, server-side retrieval, strict tenant isolation via Postgres Row-Level Security).

---

## Status at a glance

| Area | State |
|---|---|
| Visual builder (Story → Canvas → Test) | ✅ works (client-side) |
| Knowledge upload + retrieval | 🟡 works for `.txt/.md/.csv/.html`, in-browser index |
| LLM answers | 🟡 real with a Gemini key, deterministic stub without one |
| Database + RLS foundation | ✅ built & verified (Phase 1), not yet wired to the UI |
| Auth, organizations, multi-tenancy | ❌ not built yet |
| Cloud ingestion (PDF/DOCX, embeddings, pgvector) | ❌ not built yet |
| Publish + public chat + widget (new schema) | ❌ not built yet |

**Full, honest breakdown:** [docs/PRODUCT-SUMMARY.md](docs/PRODUCT-SUMMARY.md) — what the
product is, what works now, and what doesn't.
Canonical spec: [docs/flowmind-spec.md](docs/flowmind-spec.md) ·
phased plan: [docs/flowmind-prompt-pack.md](docs/flowmind-prompt-pack.md).

---

## Repository layout

```
FlowAI/
├── docs/            # spec, phased plan, audit, product summary
└── flowmind/        # the product (Next.js monorepo, pnpm + turbo)
    ├── apps/web/    # the Next.js 15 app
    ├── packages/    # @flowmind/shared — types, node constants, validators
    └── supabase/    # migrations + config (Phase 1 backend foundation)
```

## Tech stack

Next.js 15 (App Router, RSC) · React 19 · TypeScript (strict) · Tailwind CSS v4 ·
React Flow v12 · Zustand · Zod · Google Gemini · Supabase (Postgres + pgvector, Auth,
Storage) · pnpm workspaces + Turbo.

---

## Quick start (prototype, no backend needed)

```bash
cd flowmind
pnpm install
pnpm --filter @flowmind/web dev
# open http://localhost:3000
```

You can build assistants, generate flows, upload text knowledge, and run the test simulator
entirely locally (data lives in your browser). LLM answers are stubbed until you add a
`GEMINI_API_KEY` (see below).

## Optional: enable the backend / real LLM

1. Copy env template and fill it in:
   ```bash
   cp flowmind/apps/web/.env.example flowmind/apps/web/.env.local
   ```
   - `GEMINI_API_KEY` — for real generation instead of the stub.
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY` — for the database foundation.
2. Apply the database schema to your own Supabase project:
   ```bash
   cd flowmind
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
3. Verify tenant isolation (Row-Level Security):
   ```bash
   cd flowmind/apps/web
   pnpm verify:rls    # asserts every cross-tenant access is denied
   ```

> Never commit `.env.local`. `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and must stay
> server-side only.

## Useful scripts (`flowmind/apps/web`)

| Script | Does |
|---|---|
| `pnpm dev` | Run the app |
| `pnpm build` | Production build |
| `pnpm type-check` | TypeScript check |
| `pnpm db:types` | Regenerate Supabase types |
| `pnpm verify:rls` | Cross-tenant RLS test suite |

---

## Roadmap

Phase 0 (audit) and Phase 1 (database + RLS foundation) are complete. Phases 2–7 add auth &
organizations, Supabase-backed persistence, cloud ingestion, server-side retrieval, publish +
widget, and analytics. See [docs/PRODUCT-SUMMARY.md](docs/PRODUCT-SUMMARY.md) §12.
