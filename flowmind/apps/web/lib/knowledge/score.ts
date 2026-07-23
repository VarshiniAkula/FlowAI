/**
 * BM25-lite relevance scorer. Pure and dependency-free so it runs both in the
 * browser and on the server (the ingestion/retrieval routes use it to rank
 * chunks fetched from Supabase). Vector embeddings + pgvector are a later
 * enhancement; this keeps retrieval useful without an embedding key.
 */

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

export interface ScoredIndex {
  index: number;
  score: number;
}

/** Rank `texts` against `query`, returning the top-K positions (by score, desc). */
export function scoreTexts(query: string, texts: string[], topK = 4): ScoredIndex[] {
  const qTokens = tokenize(query);
  if (qTokens.length === 0 || texts.length === 0) return [];

  const tokenized = texts.map(tokenize);
  const df = new Map<string, number>();
  for (const toks of tokenized) {
    for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
  }

  const N = texts.length;
  const avgLen = tokenized.reduce((sum, t) => sum + t.length, 0) / N || 1;
  const k1 = 1.5;
  const b = 0.75;

  const scored: ScoredIndex[] = tokenized.map((tokens, index) => {
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
    return { index, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
