import type { Assistant, Graph } from '@flowmind/shared';

import type { BrowserSupabaseClient } from '@/lib/supabase/browser';
import type { Database, Json } from '@/lib/supabase/database.types';

type Client = BrowserSupabaseClient;
type Row = Database['public']['Tables']['assistants']['Row'];

/**
 * Supabase-backed assistant persistence. Every call goes through the user's
 * cookie/anon client, so Row-Level Security scopes reads and writes to the
 * caller's organization — one user can never see or touch another's assistants.
 *
 * The `Assistant` shape (from @flowmind/shared) keeps a few UI-only fields
 * (storyText, cloud publish metadata) that have no dedicated columns; those
 * ride in the row's `settings` JSON.
 */

const emptyGraph = (): Graph => ({ nodes: [], edges: [], variables: [] });

interface AssistantSettings {
  storyText?: string | null;
  cloudPublishId?: string | null;
  cloudVersion?: number | null;
  cloudPublishedAt?: number | null;
}

function settingsFromAssistant(a: Assistant): Json {
  return {
    storyText: a.storyText ?? null,
    cloudPublishId: a.cloudPublishId ?? null,
    cloudVersion: a.cloudVersion ?? null,
    cloudPublishedAt: a.cloudPublishedAt ?? null,
  };
}

function rowToAssistant(row: Row): Assistant {
  const s = (row.settings ?? {}) as AssistantSettings;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    storyText: s.storyText ?? undefined,
    status: (row.status as Assistant['status']) ?? 'draft',
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
    graph: (row.graph as unknown as Graph) ?? emptyGraph(),
    cloudPublishId: s.cloudPublishId ?? undefined,
    cloudVersion: s.cloudVersion ?? undefined,
    cloudPublishedAt: s.cloudPublishedAt ?? undefined,
  };
}

export async function dbListAssistants(supabase: Client, orgId: string): Promise<Assistant[]> {
  const { data, error } = await supabase
    .from('assistants')
    .select('*')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToAssistant);
}

export async function dbCreateAssistant(
  supabase: Client,
  orgId: string,
  name: string,
  description?: string,
): Promise<Assistant> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('assistants')
    .insert({
      org_id: orgId,
      created_by: user?.id ?? null,
      name,
      description: description ?? null,
      status: 'draft',
      graph: emptyGraph() as unknown as Json,
      settings: {},
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToAssistant(data);
}

/** Persist a full assistant object's mutable columns (name/description/status/settings). */
export async function dbSaveAssistantMeta(supabase: Client, a: Assistant): Promise<void> {
  const { error } = await supabase
    .from('assistants')
    .update({
      name: a.name,
      description: a.description ?? null,
      status: a.status,
      settings: settingsFromAssistant(a),
    })
    .eq('id', a.id);
  if (error) throw error;
}

export async function dbSaveGraph(supabase: Client, id: string, graph: Graph): Promise<void> {
  const { error } = await supabase
    .from('assistants')
    .update({ graph: graph as unknown as Json })
    .eq('id', id);
  if (error) throw error;
}

export async function dbDeleteAssistant(supabase: Client, id: string): Promise<void> {
  const { error } = await supabase.from('assistants').delete().eq('id', id);
  if (error) throw error;
}
