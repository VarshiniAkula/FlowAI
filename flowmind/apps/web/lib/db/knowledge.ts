import type { BrowserSupabaseClient } from '@/lib/supabase/browser';
import { scoreTexts } from '@/lib/knowledge/score';

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

/**
 * Retrieve the most relevant chunks for a query from Supabase. Chunks are
 * fetched (RLS-scoped) then ranked with the BM25-lite scorer. (Vector search
 * over stored embeddings is a later enhancement.)
 */
export async function dbSearchChunks(
  supabase: Client,
  assistantId: string,
  query: string,
  topK = 4,
): Promise<RetrievedChunk[]> {
  const { data, error } = await supabase
    .from('document_chunks')
    .select('content, chunk_index, document_id, documents(name)')
    .eq('assistant_id', assistantId)
    .limit(2000);
  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const ranked = scoreTexts(
    query,
    rows.map((r) => r.content),
    topK,
  );

  return ranked.map(({ index, score }) => {
    const r = rows[index]!;
    const doc = r.documents as unknown as { name: string } | null;
    return {
      content: r.content,
      documentId: r.document_id,
      documentName: doc?.name ?? 'document',
      chunkIndex: r.chunk_index,
      score,
    };
  });
}
