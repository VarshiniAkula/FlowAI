/**
 * Tiny BM25-lite scorer for the in-browser knowledge store.
 *
 * Real Phase-2/3 work will swap this for pgvector + reranking, but for the
 * Phase-1 simulator we just need *something* that returns relevant chunks
 * deterministically and without a network round-trip.
 */
import type { IndexedChunk } from './store';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her',
  'us', 'them', 'this', 'that', 'these', 'those', 'of', 'in', 'on',
  'at', 'to', 'for', 'with', 'about', 'as', 'by', 'from', 'how',
  'what', 'when', 'where', 'why', 'which', 'who', 'will', 'can',
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

export interface SearchHit {
  chunk: IndexedChunk;
  score: number;
}

export function searchChunks(
  query: string,
  chunks: IndexedChunk[],
  topK = 4,
): SearchHit[] {
  const qTokens = tokenize(query);
  if (qTokens.length === 0 || chunks.length === 0) return [];

  // Document frequency for IDF
  const df = new Map<string, number>();
  for (const c of chunks) {
    const seen = new Set(tokenize(c.text));
    for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
  }

  const N = chunks.length;
  const avgLen =
    chunks.reduce((sum, c) => sum + tokenize(c.text).length, 0) / N || 1;

  const k1 = 1.5;
  const b = 0.75;

  const scored: SearchHit[] = chunks.map((chunk) => {
    const tokens = tokenize(chunk.text);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);

    let score = 0;
    for (const q of qTokens) {
      const f = tf.get(q) ?? 0;
      if (f === 0) continue;
      const docFreq = df.get(q) ?? 0;
      const idf = Math.log(1 + (N - docFreq + 0.5) / (docFreq + 0.5));
      const norm = 1 - b + b * (tokens.length / avgLen);
      score += idf * ((f * (k1 + 1)) / (f + k1 * norm));
    }

    return { chunk, score };
  });

  return scored
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
