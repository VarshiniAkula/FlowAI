import { generateGraphJson } from '@/lib/gemini/client';
import { resolveGeminiCredential } from '@/lib/gemini/credentials';
import { GeminiError } from '@/lib/gemini/errors';
import { LIMITS } from '@/lib/gemini/limits';
import { getFallbackProvider, fallbackGenerateText } from '@/lib/llm/fallback';
import { assertSameOrigin, errorResponse, jsonNoStore } from '@/lib/gemini/request';
import {
  STORY_TO_GRAPH_PROMPT,
  generateHeuristicGraph,
  parseGraphJson,
} from '@/lib/graph-generator';

export const runtime = 'nodejs';

/**
 * POST /api/generate-graph
 * Resolves the Gemini credential and generates a flow graph:
 *   - byok / platform → Gemini (JSON), validated/repaired
 *   - fallback        → deterministic heuristic generator
 *
 * Provider errors (invalid key, quota, timeout) are surfaced as sanitized
 * errors — never silently swapped for a heuristic result while the user
 * believes Gemini is connected. Only malformed *model output* falls back to the
 * heuristic, and the response `source` field reflects that.
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);

    let body: { story?: string };
    try {
      body = await req.json();
    } catch {
      throw new GeminiError('INVALID_REQUEST', 'Expected a JSON body.');
    }

    const story = body.story?.trim();
    if (!story) {
      throw new GeminiError('INVALID_REQUEST', 'A story description is required.');
    }
    if (story.length > LIMITS.maxGraphDescriptionChars) {
      throw new GeminiError(
        'INVALID_REQUEST',
        `Story is too long (max ${LIMITS.maxGraphDescriptionChars} characters).`,
      );
    }

    const cred = await resolveGeminiCredential();

    // No Gemini key: try a configured fallback provider (Grok/Llama), else the
    // deterministic heuristic.
    if (cred.mode === 'fallback') {
      const provider = getFallbackProvider();
      if (provider) {
        const { text, model } = await fallbackGenerateText({
          provider,
          userPrompt: STORY_TO_GRAPH_PROMPT + story,
          json: true,
        });
        try {
          return jsonNoStore({ graph: parseGraphJson(text), source: 'gemini', providerMode: 'fallback-provider', model });
        } catch {
          return jsonNoStore({ graph: generateHeuristicGraph(story), source: 'heuristic', providerMode: 'fallback-provider', model, repaired: true });
        }
      }
      return jsonNoStore({
        graph: generateHeuristicGraph(story),
        source: 'heuristic',
        providerMode: 'fallback',
      });
    }

    // byok / platform: call Gemini. A provider failure throws GeminiError and
    // is surfaced; malformed model output repairs via the heuristic path.
    const { text, model } = await generateGraphJson({
      apiKey: cred.apiKey,
      prompt: STORY_TO_GRAPH_PROMPT + story,
    });

    try {
      const graph = parseGraphJson(text);
      return jsonNoStore({
        graph,
        source: 'gemini',
        providerMode: cred.mode,
        model,
      });
    } catch {
      // Valid provider call, invalid graph JSON: repair with the heuristic and
      // report it honestly via `source`.
      console.warn('[api/generate-graph] model output invalid, using heuristic repair', {
        providerMode: cred.mode,
        model,
      });
      return jsonNoStore({
        graph: generateHeuristicGraph(story),
        source: 'heuristic',
        providerMode: cred.mode,
        model,
        repaired: true,
      });
    }
  } catch (err) {
    return errorResponse(err);
  }
}
