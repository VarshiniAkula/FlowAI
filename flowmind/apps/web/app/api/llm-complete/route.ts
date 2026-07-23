import { streamText, generateText } from '@/lib/gemini/client';
import {
  resolveGeminiCredential,
  type GeminiCredentialSource,
} from '@/lib/gemini/credentials';
import { GeminiError, mapUpstreamError } from '@/lib/gemini/errors';
import { LIMITS } from '@/lib/gemini/limits';
import { assertSameOrigin, errorResponse, jsonNoStore } from '@/lib/gemini/request';
import { getFallbackProvider, fallbackGenerateText, fallbackStreamText } from '@/lib/llm/fallback';

export const runtime = 'nodejs';

interface Body {
  systemPrompt?: string;
  userPrompt?: string;
  temperature?: number;
  stream?: boolean;
}

/**
 * POST /api/llm-complete — LLM completion for the test simulator.
 *
 * Credential precedence via resolveGeminiCredential():
 *   - byok / platform → real Gemini (JSON or SSE streaming)
 *   - fallback        → deterministic canned reply (preserves the offline demo)
 *
 * Streaming frame shape is unchanged (`event: chunk|done|error`), so the
 * runtime's SSE consumer keeps working. Provider metadata (mode/model/tokens)
 * rides on the `done` frame / JSON body — never any key material.
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);

    let body: Body;
    try {
      body = await req.json();
    } catch {
      throw new GeminiError('INVALID_REQUEST', 'Invalid JSON body.');
    }

    const url = new URL(req.url);
    const wantsStream = body.stream === true || url.searchParams.get('stream') === '1';
    const systemPrompt = (body.systemPrompt ?? '').trim();
    const userPrompt = (body.userPrompt ?? '').trim();

    if (!userPrompt && !systemPrompt) {
      throw new GeminiError('INVALID_REQUEST', 'systemPrompt or userPrompt is required.');
    }
    if (systemPrompt.length + userPrompt.length > LIMITS.maxLlmPromptChars) {
      throw new GeminiError(
        'INVALID_REQUEST',
        `Prompt is too long (max ${LIMITS.maxLlmPromptChars} characters).`,
      );
    }

    const cred = await resolveGeminiCredential();

    if (wantsStream) {
      return streamResponse({ cred, systemPrompt, userPrompt, temperature: body.temperature });
    }

    if (cred.mode === 'fallback') {
      // No Gemini credential: use a configured fallback provider (Grok/Llama)
      // for real AI, else the deterministic demo stub.
      const provider = getFallbackProvider();
      if (provider) {
        const r = await fallbackGenerateText({
          provider,
          systemPrompt: systemPrompt || undefined,
          userPrompt,
          temperature: body.temperature,
        });
        return jsonNoStore({
          text: r.text,
          source: provider.name,
          providerMode: 'fallback-provider',
          model: r.model,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
        });
      }
      return jsonNoStore({
        text: stubReply(systemPrompt, userPrompt),
        source: 'stub',
        providerMode: 'fallback',
      });
    }

    const result = await generateText({
      apiKey: cred.apiKey,
      systemPrompt: systemPrompt || undefined,
      userPrompt,
      temperature: body.temperature,
    });
    return jsonNoStore({
      text: result.text,
      source: 'gemini',
      providerMode: cred.mode,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

interface StreamArgs {
  cred: GeminiCredentialSource;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}

function streamResponse({ cred, systemPrompt, userPrompt, temperature }: StreamArgs): Response {
  const encoder = new TextEncoder();
  const sse = (event: string, data: unknown) =>
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (cred.mode === 'fallback') {
          const provider = getFallbackProvider();
          if (!provider) {
            const full = stubReply(systemPrompt, userPrompt);
            for (const piece of chunkStub(full)) {
              controller.enqueue(sse('chunk', { delta: piece }));
              await sleep(20);
            }
            controller.enqueue(sse('done', { text: full, source: 'stub', providerMode: 'fallback' }));
            controller.close();
            return;
          }
          const fb = await fallbackStreamText({
            provider,
            systemPrompt: systemPrompt || undefined,
            userPrompt,
            temperature,
          });
          let full = '';
          for await (const delta of fb.deltas) {
            full += delta;
            controller.enqueue(sse('chunk', { delta }));
          }
          controller.enqueue(
            sse('done', { text: full, source: provider.name, providerMode: 'fallback-provider', model: fb.model }),
          );
          controller.close();
          return;
        }

        const { model, deltas } = await streamText({
          apiKey: cred.apiKey,
          systemPrompt: systemPrompt || undefined,
          userPrompt,
          temperature,
        });

        let full = '';
        while (true) {
          const next = await deltas.next();
          if (next.done) {
            const usage = next.value;
            controller.enqueue(
              sse('done', {
                text: full,
                source: 'gemini',
                providerMode: cred.mode,
                model,
                inputTokens: usage?.inputTokens,
                outputTokens: usage?.outputTokens,
              }),
            );
            controller.close();
            return;
          }
          full += next.value;
          controller.enqueue(sse('chunk', { delta: next.value }));
        }
      } catch (err) {
        // Sanitized error only — no raw provider object, headers, or key.
        const g = mapUpstreamError(err);
        controller.enqueue(sse('error', { error: g.message, code: g.code }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function chunkStub(text: string): string[] {
  const out: string[] = [];
  const words = text.split(/(\s+)/);
  let buf = '';
  for (const w of words) {
    buf += w;
    if (buf.length >= 8) {
      out.push(buf);
      buf = '';
    }
  }
  if (buf) out.push(buf);
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function stubReply(systemPrompt: string, userPrompt: string): string {
  const sys = systemPrompt ? `(system: ${systemPrompt.slice(0, 80)}...) ` : '';
  return (
    `${sys}Demo mode - this is a simulated response. Connect a Gemini key to enable ` +
    `real AI answers. You asked: "${userPrompt.slice(0, 200)}"`
  );
}
