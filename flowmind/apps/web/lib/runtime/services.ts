import type { RetrievedChunk, RuntimeServices } from '@flowmind/shared';

/**
 * Default in-memory services suitable for the Simulator.
 *
 * - retrieval: returns nothing (Knowledge upload is implemented in a later
 *   phase). When the user wires up real document indexing, swap this for the
 *   server-side retrieval client.
 * - llm: dispatches to the same Gemini API the Story Builder uses, via a
 *   thin server route so we don't ship the API key into the browser bundle.
 */
export function createSimulatorServices(): RuntimeServices {
  return {
    retrieval: {
      async query(_query: string, _topK: number): Promise<RetrievedChunk[]> {
        return [];
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
