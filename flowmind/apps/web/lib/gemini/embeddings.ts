import 'server-only';

import { GoogleGenAI } from '@google/genai';

import { mapUpstreamError } from './errors';

/**
 * Server-only text embeddings via Gemini `gemini-embedding-001`, truncated to
 * 768 dimensions to match the `document_chunks.embedding vector(768)` column +
 * HNSW cosine index.
 *
 * Task types matter for retrieval quality: index chunks with RETRIEVAL_DOCUMENT
 * and embed queries with RETRIEVAL_QUERY so the two share an aligned space.
 *
 * Receives a raw Gemini API key (BYOK or platform) — must never be importable
 * from client code.
 */

export const EMBEDDING_MODEL = 'gemini-embedding-001';
export const EMBEDDING_DIMS = 768;

export type EmbeddingTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

/** L2-normalize a vector. gemini-embedding-001 only auto-normalizes at 3072 dims;
 *  truncated outputs should be normalized for correct cosine behavior. */
function normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v;
  return v.map((x) => x / norm);
}

/** Format a vector for pgvector text input: `[0.1,0.2,...]`. */
export function toPgVector(v: number[]): string {
  return `[${v.join(',')}]`;
}

/**
 * Embed one or more texts. Returns one 768-dim vector per input, in order.
 * Empty inputs are embedded as-is (the caller filters empties). Throws a
 * sanitized GeminiError on provider failure.
 */
export async function embedTexts(
  apiKey: string,
  texts: string[],
  taskType: EmbeddingTaskType,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const ai = new GoogleGenAI({ apiKey });

  try {
    const res = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: texts,
      config: { taskType, outputDimensionality: EMBEDDING_DIMS },
    });
    const embeddings = res.embeddings ?? [];
    if (embeddings.length !== texts.length) {
      throw new Error('embedding count mismatch');
    }
    return embeddings.map((e) => normalize(e.values ?? []));
  } catch (err) {
    throw mapUpstreamError(err);
  }
}

/** Embed a single query. Convenience wrapper over embedTexts. */
export async function embedQuery(apiKey: string, query: string): Promise<number[]> {
  const [v] = await embedTexts(apiKey, [query], 'RETRIEVAL_QUERY');
  return v ?? [];
}
