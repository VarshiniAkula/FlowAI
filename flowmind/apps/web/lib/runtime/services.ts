import type {
  LlmCompleteResult,
  LlmCompletionInfo,
  RetrievedChunk,
  RuntimeServices,
} from '@flowmind/shared';
import { dbSearchChunks } from '@/lib/db/knowledge';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

/**
 * Default in-memory services suitable for the Simulator.
 *
 * - retrieval: scoped to the active assistant via the in-browser knowledge
 *   store. Phase 2/3 will swap this for server-side pgvector + reranking.
 * - llm: dispatches to Gemini via /api/llm-complete so the API key stays on
 *   the server.
 */
export function createSimulatorServices(assistantId: string): RuntimeServices {
  const supabase = createSupabaseBrowserClient();
  return {
    retrieval: {
      async query(query: string, topK: number): Promise<RetrievedChunk[]> {
        // Retrieve from Supabase-stored chunks (RLS-scoped to the user's org).
        const hits = await dbSearchChunks(supabase, assistantId, query, topK);
        return hits.map((h) => ({
          content: h.content,
          source: h.documentName,
          score: h.score,
          documentId: h.documentId,
          metadata: { chunkIndex: h.chunkIndex, documentName: h.documentName },
        }));
      },
    },
    llm: {
      async complete({ systemPrompt, userPrompt, temperature, onChunk }): Promise<LlmCompleteResult> {
        // Non-streaming path: single round-trip JSON.
        if (!onChunk) {
          const res = await fetch('/api/llm-complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemPrompt, userPrompt, temperature }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error?.message || body.error || `LLM HTTP ${res.status}`);
          }
          const json = await res.json();
          return { text: String(json.text ?? ''), info: extractInfo(json) };
        }

        // Streaming path: parse SSE frames and forward each delta to onChunk.
        const res = await fetch('/api/llm-complete?stream=1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemPrompt, userPrompt, temperature, stream: true }),
        });
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error?.message || body.error || `LLM HTTP ${res.status}`);
        }
        return await consumeSse(res.body, onChunk);
      },
    },
  };
}

/**
 * Minimal SSE parser tailored to /api/llm-complete's frame shape:
 *   event: chunk
 *   data: {"delta":"..."}
 *
 *   event: done
 *   data: {"text":"..."}
 *
 * Buffers across network reads, splits on the standard `\n\n` event delimiter,
 * and returns the final accumulated text once the `done` (or `error`) frame
 * arrives. Throws on `error` frames so callers can fall back to the static
 * "(LLM error: ...)" path that the engine already understands.
 */
async function consumeSse(
  body: ReadableStream<Uint8Array>,
  onChunk: (delta: string) => void,
): Promise<LlmCompleteResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let acc = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (!frame.trim()) continue;

        let event = 'message';
        let data = '';
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (!data) continue;

        let parsed: any;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }

        if (event === 'chunk' && typeof parsed.delta === 'string') {
          acc += parsed.delta;
          onChunk(parsed.delta);
        } else if (event === 'done') {
          return {
            text: typeof parsed.text === 'string' ? parsed.text : acc,
            info: extractInfo(parsed),
          };
        } else if (event === 'error') {
          throw new Error(parsed.error || 'LLM stream error');
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { text: acc };
}

/** Pull sanitized provider metadata off a JSON body or `done` frame. */
function extractInfo(o: Record<string, unknown>): LlmCompletionInfo | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const info: LlmCompletionInfo = {};
  if (typeof o.provider === 'string') info.provider = o.provider as LlmCompletionInfo['provider'];
  if (typeof o.providerMode === 'string')
    info.providerMode = o.providerMode as LlmCompletionInfo['providerMode'];
  if (typeof o.model === 'string') info.model = o.model;
  if (typeof o.durationMs === 'number') info.durationMs = o.durationMs;
  if (typeof o.inputTokens === 'number') info.inputTokens = o.inputTokens;
  if (typeof o.outputTokens === 'number') info.outputTokens = o.outputTokens;
  if (typeof o.demoRequestsRemaining === 'number')
    info.demoRequestsRemaining = o.demoRequestsRemaining;
  if (typeof o.fallbackReason === 'string') info.fallbackReason = o.fallbackReason;
  return Object.keys(info).length > 0 ? info : undefined;
}
