import { NextResponse } from 'next/server';

import { GuardError, requireAssistantAccess } from '@/lib/auth/guards';
import { resolveGeminiCredential } from '@/lib/gemini/credentials';
import { embedQuery, toPgVector } from '@/lib/gemini/embeddings';
import { scoreTexts } from '@/lib/knowledge/score';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

interface Body {
  assistantId?: string;
  query?: string;
  topK?: number;
}

export interface SearchHit {
  content: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  score: number;
}

/**
 * POST /api/knowledge/search — retrieve the most relevant chunks for a query.
 *
 * Precedence:
 *   1. Vector search — when a Gemini credential is available, embed the query
 *      (RETRIEVAL_QUERY, 768-dim) and cosine-match against stored chunk
 *      embeddings via match_document_chunks (HNSW).
 *   2. BM25-lite — when there is no key, embedding fails, or no chunk has an
 *      embedding yet, rank lexically over the assistant's chunks.
 *
 * Access is verified with requireAssistantAccess; the service role then reads
 * within that assistant only. Query embedding happens server-side so the Gemini
 * key never reaches the browser.
 */
export async function POST(req: Request) {
  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return errJson('NOT_FOUND', 'Expected a JSON body.', 400);
    }

    const assistantId = String(body.assistantId ?? '');
    const query = (body.query ?? '').trim();
    const topK = clampTopK(body.topK);
    if (!assistantId) return errJson('NOT_FOUND', 'Missing "assistantId".', 400);
    if (!query) return NextResponse.json({ method: 'none', hits: [] });

    await requireAssistantAccess(assistantId, 'member');
    const service = createSupabaseServiceClient();

    // 1) Vector search when a Gemini credential is available.
    const cred = await resolveGeminiCredential();
    if (cred.mode === 'byok' || cred.mode === 'platform') {
      try {
        const vec = await embedQuery(cred.apiKey, query);
        if (vec.length > 0) {
          const { data, error } = await service.rpc('match_document_chunks', {
            p_assistant_id: assistantId,
            p_query_embedding: toPgVector(vec) as unknown as string,
            p_match_count: topK,
          });
          if (!error && data && data.length > 0) {
            const hits: SearchHit[] = data.map((r) => ({
              content: r.content,
              documentId: r.document_id,
              documentName: r.document_name ?? 'document',
              chunkIndex: r.chunk_index,
              score: r.similarity ?? 0,
            }));
            return NextResponse.json({ method: 'vector', hits });
          }
        }
      } catch {
        // fall through to BM25 — never surface the provider error here.
      }
    }

    // 2) BM25-lite fallback over the assistant's chunks.
    const hits = await bm25Search(service, assistantId, query, topK);
    return NextResponse.json({ method: 'bm25', hits });
  } catch (err) {
    if (err instanceof GuardError) return errJson(err.code, err.message, err.status);
    console.error('[knowledge/search] error', err);
    return errJson('SEARCH_FAILED', 'Search failed.', 500);
  }
}

async function bm25Search(
  service: ReturnType<typeof createSupabaseServiceClient>,
  assistantId: string,
  query: string,
  topK: number,
): Promise<SearchHit[]> {
  const { data, error } = await service
    .from('document_chunks')
    .select('content, chunk_index, document_id, documents(name)')
    .eq('assistant_id', assistantId)
    .limit(2000);
  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const ranked = scoreTexts(query, rows.map((r) => r.content), topK);
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

function clampTopK(v: unknown): number {
  const n = typeof v === 'number' ? Math.floor(v) : 4;
  return Math.min(Math.max(Number.isFinite(n) ? n : 4, 1), 20);
}

function errJson(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}
