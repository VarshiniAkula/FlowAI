import type { RetrievedChunk, RuntimeServices } from '@flowmind/shared';
import { useKnowledgeStore } from '@/lib/knowledge/store';

/**
 * Default in-memory services suitable for the Simulator.
 *
 * - retrieval: scoped to the active assistant via the in-browser knowledge
 *   store. Phase 2/3 will swap this for server-side pgvector + reranking.
 * - llm: dispatches to Gemini via /api/llm-complete so the API key stays on
 *   the server.
 */
export function createSimulatorServices(assistantId: string): RuntimeServices {
  return {
    retrieval: {
      async query(query: string, topK: number): Promise<RetrievedChunk[]> {
        const hits = useKnowledgeStore.getState().search(assistantId, query, topK);
        return hits.map((h) => ({
          content: h.chunk.text,
          source: h.chunk.documentId,
          score: h.score,
          documentId: h.chunk.documentId,
          metadata: { chunkIndex: h.chunk.index },
        }));
      },
    },
    llm: {
      async complete({ systemPrompt, userPrompt, temperature }) {
        const res = await fetch('/api/llm-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemPrompt, userPrompt, temperature }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `LLM HTTP ${res.status}`);
        }
        const json = await res.json();
        return String(json.text ?? '');
      },
    },
  };
}
