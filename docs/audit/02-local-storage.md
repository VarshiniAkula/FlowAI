# Audit 02 — Browser storage usage

Scope: every `localStorage`, `sessionStorage`, `IndexedDB` reference under `flowmind/apps/web/`. Searched via grep on the active app tree.

## localStorage (authoritative writes)

These two zustand stores use the `persist` middleware → all state is mirrored into `window.localStorage`. They are the **source of truth** for assistants and knowledge today. Both must die in later phases.

| File:line | Storage key | Data persisted | Authoritative? | Replacement phase |
|---|---|---|---|---|
| [flowmind/apps/web/stores/assistant-store.ts:24](flowmind/apps/web/stores/assistant-store.ts) (`persist(...)`) → name at [:63](flowmind/apps/web/stores/assistant-store.ts#L63) | `flowmind-assistants` | Full `assistants[]` array — id, name, description, status, graph, settings, timestamps, cloud-publish state. Created/updated/deleted entirely client-side. | **Yes — sole copy.** | Phase 3 (Assistant persistence). |
| [flowmind/apps/web/lib/knowledge/store.ts:31](flowmind/apps/web/lib/knowledge/store.ts) (`persist(...)`) → name at [:78](flowmind/apps/web/lib/knowledge/store.ts#L78) | `flowmind-knowledge` | Full `documents[]` (KnowledgeSource metadata) **and** `chunks[]` (every chunk's text + index + assistantId). Search runs over this in-browser via BM25-lite. | **Yes — sole copy.** Documents are uploaded, chunked, and indexed entirely in the browser. | Phase 4 (Knowledge ingestion). |

## localStorage (read-only consumers of the two stores above)

These files don't write directly but assume `useAssistantStore` / `useKnowledgeStore` are populated from localStorage. They effectively reinforce the localStorage-as-truth model.

- [flowmind/apps/web/app/dashboard/page.tsx](flowmind/apps/web/app/dashboard/page.tsx) — reads `useAssistantStore` to render the assistant list and to create new ones (`createAssistant`).
- [flowmind/apps/web/components/editor/editor-shell.tsx:48-49](flowmind/apps/web/components/editor/editor-shell.tsx#L48) — reads `useAssistantStore.getAssistant`, calls `saveGraph`/`updateAssistant` on every edit.
- [flowmind/apps/web/components/knowledge/knowledge-manager.tsx:32-37](flowmind/apps/web/components/knowledge/knowledge-manager.tsx#L32) — subscribes imperatively to `useKnowledgeStore`; uploads call `addDocument(...)` which writes to localStorage.
- [flowmind/apps/web/components/chat/hosted-chat.tsx:64-69](flowmind/apps/web/components/chat/hosted-chat.tsx#L64) — for non-`pub_*` ids, reads owner-side assistant from `useAssistantStore` (i.e. localStorage). Comment at [:45](flowmind/apps/web/components/chat/hosted-chat.tsx#L45) acknowledges this fallback.
- [flowmind/apps/web/lib/runtime/services.ts:13-19](flowmind/apps/web/lib/runtime/services.ts#L13) — `createSimulatorServices(...)` retrieval uses `useKnowledgeStore.getState().search(...)` → in-browser RAG over localStorage chunks.
- [flowmind/apps/web/components/analytics/analytics-panel.tsx:66](flowmind/apps/web/components/analytics/analytics-panel.tsx#L66) — comment about "React 19 + Zustand persist snapshot issues"; component subscribes to `useAssistantStore`.
- [flowmind/apps/web/app/chat/[assistantId]/page.tsx:15](flowmind/apps/web/app/chat/[assistantId]/page.tsx#L15) — comment in metadata generator: "we can't read client-side localStorage from the server."

## sessionStorage

- **Zero hits.** Spec/prompt pack expect `sessionStorage` to hold the public chat `sessionId` (Phase 6) and the builder autosave draft (Phase 3); neither exists yet.

## IndexedDB

- **Zero hits.** Not used anywhere.

## Summary

Two authoritative localStorage stores must be removed:
1. `flowmind-assistants` → Supabase `assistants` table (Phase 3).
2. `flowmind-knowledge` → Supabase `documents` + `document_chunks` + Storage (Phase 4).

Per Phase 3 Task 7 / Phase 7 Task 5, both keys should additionally power a one-time "Import legacy data" flow so existing pre-SaaS users don't lose their work.

After replacement, the only acceptable browser-storage uses are:
- `flowmind-active-org` cookie (Phase 2) — selected org, server-readable.
- `sessionStorage` autosave draft in builder (Phase 3) — non-authoritative.
- `sessionStorage` `sessionId` in public chat widget (Phase 6) — non-authoritative.
