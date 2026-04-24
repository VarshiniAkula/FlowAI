# Audit 03 — Current Supabase usage

## Migrations folder

There is **no `supabase/` directory** in the repo and **no SQL migrations**. The current Supabase project is configured manually outside the codebase. There is no `supabase/config.toml`, no `supabase/migrations/`, no `supabase/seed.sql`. This means there is no reproducible local Supabase setup today.

## Tables in use (inferred from query call sites)

| Table | Used by | Columns referenced (from code) |
|---|---|---|
| `flowmind_published_assistants` | [app/api/publish/route.ts](flowmind/apps/web/app/api/publish/route.ts), [app/api/published/[id]/route.ts](flowmind/apps/web/app/api/published/[id]/route.ts), [app/chat/[assistantId]/page.tsx](flowmind/apps/web/app/chat/[assistantId]/page.tsx), [app/api/health/route.ts](flowmind/apps/web/app/api/health/route.ts) | `id`, `assistant_id`, `name`, `description`, `graph` (jsonb), `version`, `published_at` |
| `flowmind_conversations` | [app/api/conversations/route.ts](flowmind/apps/web/app/api/conversations/route.ts), [app/api/conversations/[id]/route.ts](flowmind/apps/web/app/api/conversations/[id]/route.ts), [app/api/analytics/[assistantId]/route.ts](flowmind/apps/web/app/api/analytics/[assistantId]/route.ts) | `id`, `publish_id`, `assistant_id`, `started_at`, `ended_at`, `turn_count`, `status` |

That is the **entire** Supabase schema in active use. None of the tables in spec section C exist (`profiles`, `organizations`, `memberships`, `assistants`, `knowledge_sources`, `documents`, `document_chunks`, `messages`, `usage_events`).

Notably absent:
- No `org_id` column on either existing table.
- No vector / pgvector usage.
- No storage buckets referenced.
- No `auth.*` references (Supabase Auth is unused).

## RLS policies

**Unknown — not in the repo.** Comment in [lib/supabase/server.ts:7-9](flowmind/apps/web/lib/supabase/server.ts) claims:

> "RLS policies on flowmind_published_assistants explicitly allow anon read + insert; the API route enforces validation on top."

So today the published-assistants table is effectively writable by any anonymous client holding the publishable key. This is acceptable only because:
1. The key is `NEXT_PUBLIC_SUPABASE_ANON_KEY`, designed to be exposed.
2. The publish API is the only client.

But there's no defense in depth: a leaked anon key + knowledge of table names ⇒ anyone can write to `flowmind_published_assistants` and `flowmind_conversations`. Phase 1's RLS rewrite must replace this entirely.

## Client creation pattern

Single helper file: [flowmind/apps/web/lib/supabase/server.ts](flowmind/apps/web/lib/supabase/server.ts)

```ts
export function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  ...
  return createClient(url, key, { auth: { persistSession: false } });
}
export function isSupabaseConfigured(): boolean { ... }
```

Properties:
- Uses `@supabase/supabase-js` directly. **Does not use `@supabase/ssr`** anywhere — Phase 1 must add it and adopt the cookie-based pattern.
- Returns the **anon key** even on the server. There is no service-role client.
- File name says "server" but it is not marked `import 'server-only'`. The file *does* read `process.env.*` and is imported only from route handlers, so it doesn't currently leak — but the lack of guard is a footgun.
- **No browser client** exists. There is no equivalent of `lib/supabase/browser.ts`. All current Supabase access happens from API routes.
- **No service-role client** exists. `SUPABASE_SERVICE_ROLE_KEY` is not referenced anywhere in the codebase (verified by grep across `flowmind/`).

## Auth usage

- No `@supabase/ssr` import.
- No `auth.signIn*`, `auth.signUp*`, `auth.signOut*`, `auth.getUser` calls anywhere.
- No middleware.ts in the app.
- No login / signup / logout / onboarding pages.
- The `createClient` call passes `{ auth: { persistSession: false } }`, confirming auth is intentionally disabled.

## Implications for Phase 1

- Greenfield Supabase setup. Nothing to migrate from existing Supabase schema except the two ad-hoc `flowmind_*` tables — those are best discarded and re-created with proper `org_id` columns inside the new schema, with a one-shot data move (or deferred until Phase 6 when the new publish flow ships).
- The existing `lib/supabase/server.ts` will be replaced with three files per spec D-section pattern: `lib/supabase/server.ts` (cookie-bound, ssr), `lib/supabase/service.ts` (service role, server-only), `lib/supabase/browser.ts` (anon, browser).
- Need to decide whether to keep the `flowmind_published_assistants` and `flowmind_conversations` rows alive during cutover (low value — they hold zero per-user data and any "published" assistant only exists because someone in the editor clicked Publish).
