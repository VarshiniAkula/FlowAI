# Audit 01 — Repo layout

Repo root is a sparse meta-repo. Two product trees coexist; only one is the FlowMind code under audit.

| Path | Type | Description | Status |
|---|---|---|---|
| `flowchat/` | Python + Vite/React prototype | Earlier "FlowChat" prototype: FastAPI server, Rasa integration, Claude client, in-memory RAG. Not the FlowMind product. | **Dead** for FlowMind purposes — keep for reference, do not modify in any phase. |
| `flowmind/` | pnpm + turbo monorepo root | Workspace root. `package.json` declares `pnpm@10.33.0`, scripts proxy to turbo. `pnpm-workspace.yaml` includes `apps/*` and `packages/*`. | **Live** |
| `flowmind/apps/web/` | Next.js 15.5.14 App Router app (`@flowmind/web`) | The active FlowMind app. React 19, TypeScript strict, Tailwind 4 beta, @xyflow/react canvas, zustand stores, @supabase/supabase-js (no `@supabase/ssr` yet), @google/generative-ai. | **Live — primary target for all phases.** |
| `flowmind/packages/shared/` | TS package (`@flowmind/shared`) | Shared types (`Assistant`, `Graph`, `KnowledgeSource`, runtime types) and zod validators consumed by the web app via `workspace:*`. | **Live** |
| `flowmind/dev.sh` | Bash helper | One-line `pnpm --filter @flowmind/web dev` launcher. | Live, trivial. |
| `docs/` | Markdown | Spec + prompt pack + this audit. | Live (added in Phase 0). |
| `.claude/`, `.turbo/` | Tooling state | Editor/runner caches. | N/A |

## Key implications for later phases

- "Active app directory" everywhere in the prompt pack = `flowmind/apps/web/`. Paths like `/app/(app)/...` referenced in the phase prompts must be created under `flowmind/apps/web/app/`.
- `lib/`, `stores/`, `components/`, `app/` are all already established under `flowmind/apps/web/`. New `lib/auth/`, `lib/db/`, `lib/ingest/`, `lib/llm/`, `lib/retrieval/`, `lib/templates/` directories belong under `flowmind/apps/web/lib/`.
- `supabase/` migrations folder does **not** exist; will be created at the monorepo root (`flowmind/supabase/`) in Phase 1, since `supabase` CLI runs from a single project root.
- `flowchat/` is intentionally untouched. None of the phases reference it.
