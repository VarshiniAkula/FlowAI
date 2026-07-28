import type { BrowserSupabaseClient } from '@/lib/supabase/browser';

type Client = BrowserSupabaseClient;

/**
 * Knowledge reads via the user's browser client. Row-Level Security scopes
 * `documents` and `document_chunks` to the caller's org, so a user only ever
 * sees their own knowledge. Writes (ingest/delete) go through server routes.
 */

export interface KnowledgeDoc {
  id: string;
  name: string;
  status: string;
  chunkCount: number;
  sizeBytes: number | null;
  createdAt: number;
}

export interface RetrievedChunk {
  content: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  score: number;
}

/** List the documents ingested for an assistant, with chunk counts. */
export async function dbListDocuments(
  supabase: Client,
  assistantId: string,
): Promise<KnowledgeDoc[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('id, name, status, size_bytes, created_at, document_chunks(count)')
    .eq('assistant_id', assistantId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    status: d.status,
    chunkCount: (d.document_chunks as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
    sizeBytes: d.size_bytes,
    createdAt: Date.parse(d.created_at),
  }));
}

// Retrieval now runs server-side via POST /api/knowledge/search (vector search
// with a BM25 fallback), so the query embedding + Gemini key stay on the
// server. The `RetrievedChunk` shape above matches that route's `hits`.
