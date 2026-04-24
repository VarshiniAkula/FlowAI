# FlowAI / FlowMind

Active product: `flowmind/apps/web` (Next.js 15, App Router, TypeScript strict).
Full spec: [docs/flowmind-spec.md](docs/flowmind-spec.md). Phased plan: [docs/flowmind-prompt-pack.md](docs/flowmind-prompt-pack.md).

## Local Supabase

FlowMind uses a dedicated Supabase project (`flowmind-dev`). Do **not** point at the
legacy demo project — create your own.

### Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`)
- Docker (for `supabase start`)
- Node.js 20+, pnpm 9+

### First-time setup

1. Create a fresh Supabase project at <https://supabase.com/dashboard>. Call it
   `flowmind-dev` (or any name — only yours).
2. Copy `flowmind/apps/web/.env.example` to `flowmind/apps/web/.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` — project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — publishable key (sb_publishable_...)
   - `SUPABASE_SERVICE_ROLE_KEY` — service role key (server only; never commit)
   - `GEMINI_API_KEY`, `NEXT_PUBLIC_APP_URL`
3. From `flowmind/`, apply migrations:

   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

   For a fresh local stack instead:

   ```bash
   cd flowmind
   supabase start
   supabase db reset        # applies all migrations in supabase/migrations/
   ```

4. Generate Supabase TypeScript types:

   ```bash
   cd flowmind/apps/web
   pnpm db:types
   ```

5. Run the RLS verification suite against your project:

   ```bash
   pnpm verify:rls
   ```

   This creates two throwaway users in two orgs and asserts every cross-tenant
   access is denied. Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

### Edge Functions (Phase 4+)

Knowledge ingestion runs in the `ingest-document` Supabase Edge Function (Deno).
For local dev, run it alongside `pnpm dev`:

```bash
cd flowmind
supabase functions serve ingest-document --env-file ./supabase/.env.local
```

## Dev server

```bash
cd flowmind
pnpm install
pnpm --filter @flowmind/web dev
```
