'use client';

import { create } from 'zustand';
import type { Assistant, Graph } from '@flowmind/shared';

import {
  dbCreateAssistant,
  dbDeleteAssistant,
  dbListAssistants,
  dbSaveAssistantMeta,
  dbSaveGraph,
} from '@/lib/db/assistants';
import { ensurePersonalOrg } from '@/lib/db/orgs';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

/**
 * Supabase-backed assistant store. Assistants live in Postgres, scoped to the
 * signed-in user's organization by Row-Level Security — so each account's
 * history is fully isolated from every other account's.
 *
 * The UI keeps an in-memory copy for responsiveness: reads are synchronous,
 * writes update memory immediately (optimistic) and persist in the background.
 * `createAssistant` is the one async method because callers need the real id
 * the database assigns.
 */

let cachedClient: ReturnType<typeof createSupabaseBrowserClient> | null = null;
function client() {
  return (cachedClient ??= createSupabaseBrowserClient());
}

interface AssistantStore {
  assistants: Assistant[];
  orgId: string | null;
  loaded: boolean;
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  createAssistant: (name: string, description?: string) => Promise<Assistant>;
  updateAssistant: (id: string, patch: Partial<Assistant>) => void;
  deleteAssistant: (id: string) => void;
  getAssistant: (id: string) => Assistant | undefined;
  saveGraph: (id: string, graph: Graph) => void;
}

export const useAssistantStore = create<AssistantStore>()((set, get) => ({
  assistants: [],
  orgId: null,
  loaded: false,
  loading: false,
  error: null,

  load: async () => {
    // Fetch once per session; avoids clobbering optimistic state on navigation.
    if (get().loading || get().loaded) return;
    set({ loading: true, error: null });
    try {
      const supabase = client();
      const orgId = await ensurePersonalOrg(supabase);
      const assistants = await dbListAssistants(supabase, orgId);
      set({ assistants, orgId, loaded: true, loading: false });
    } catch (e) {
      set({
        loading: false,
        loaded: true,
        error: e instanceof Error ? e.message : 'Failed to load assistants',
      });
    }
  },

  createAssistant: async (name, description) => {
    const supabase = client();
    const orgId = get().orgId ?? (await ensurePersonalOrg(supabase));
    const assistant = await dbCreateAssistant(supabase, orgId, name, description);
    set((s) => ({ assistants: [assistant, ...s.assistants], orgId }));
    return assistant;
  },

  updateAssistant: (id, patch) => {
    let updated: Assistant | undefined;
    set((s) => ({
      assistants: s.assistants.map((a) => {
        if (a.id !== id) return a;
        updated = { ...a, ...patch, updatedAt: Date.now() };
        return updated;
      }),
    }));
    if (updated) {
      dbSaveAssistantMeta(client(), updated).catch((e) =>
        console.error('[assistants] failed to save changes', e),
      );
    }
  },

  deleteAssistant: (id) => {
    set((s) => ({ assistants: s.assistants.filter((a) => a.id !== id) }));
    dbDeleteAssistant(client(), id).catch((e) =>
      console.error('[assistants] failed to delete', e),
    );
  },

  getAssistant: (id) => get().assistants.find((a) => a.id === id),

  saveGraph: (id, graph) => {
    let found = false;
    set((s) => ({
      assistants: s.assistants.map((a) => {
        if (a.id !== id) return a;
        found = true;
        return { ...a, graph, updatedAt: Date.now() };
      }),
    }));
    if (found) {
      dbSaveGraph(client(), id, graph).catch((e) =>
        console.error('[assistants] failed to save graph', e),
      );
    }
  },
}));
