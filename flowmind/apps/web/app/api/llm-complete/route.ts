import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';

interface Body {
  systemPrompt?: string;
  userPrompt?: string;
  temperature?: number;
  stream?: boolean;
}

/**
 * LLM completion endpoint. Two response modes:
 *
 * - JSON (default): single round-trip, returns `{ text, source }`. Used by
 *   server-side / non-interactive callers.
 * - SSE (when `?stream=1` or `body.stream === true`): a `text/event-stream`
 *   that emits `event: chunk` frames carrying `{delta}` plus a terminal
 *   `event: done` frame with the full text. The hosted chat consumes this so
 *   visitors see tokens land as they're generated rather than after the whole
 *   answer arrives.
 *
 * Both modes degrade gracefully when `GEMINI_API_KEY` is missing — the stub
 * branch synthesizes a deterministic reply (and, in stream mode, fakes a
 * paced character-by-character drip so the UI streaming path is still
 * exercised end-to-end).
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const url = new URL(req.url);
  const wantsStream = body.stream === true || url.searchParams.get('stream') === '1';

  const systemPrompt = (body.systemPrompt ?? '').trim();
  const userPrompt = (body.userPrompt ?? '').trim();
  if (!userPrompt && !systemPrompt) {
    return NextResponse.json(
      { error: 'systemPrompt or userPrompt is required' },
      { status: 400 },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (wantsStream) {
    return streamResponse({ systemPrompt, userPrompt, temperature: body.temperature, apiKey });
  }

  if (!apiKey) {
    // Soft-fail with a deterministic stub so the simulator stays usable
    // even when the user hasn't wired up an API key yet.
    return NextResponse.json({
      text: stubReply(systemPrompt, userPrompt),
      source: 'stub',
    });
  }

  try {
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      systemInstruction: systemPrompt || undefined,
      generationConfig: {
        temperature: body.temperature ?? 0.7,
        maxOutputTokens: 1024,
      },
    });
    const result = await model.generateContent(userPrompt || ' ');
    const text = result.response.text();
    return NextResponse.json({ text, source: 'gemini' });
  } catch (err) {
    console.error('[api/llm-complete] error:', err);
    return NextResponse.json(
      { error: 'LLM call failed', details: String(err) },
      { status: 500 },
    );
  }
}

interface StreamArgs {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  apiKey: string | undefined;
}

function streamResponse({ systemPrompt, userPrompt, temperature, apiKey }: StreamArgs): Response {
  const encoder = new TextEncoder();
  const sse = (event: string, data: unknown) =>
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (!apiKey) {
          // Stub mode: drip the canned reply so the UI streaming path is
          // exercised even without a real API key.
          const full = stubReply(systemPrompt, userPrompt);
          for (const piece of chunkStub(full)) {
            controller.enqueue(sse('chunk', { delta: piece }));
            await sleep(20);
          }
          controller.enqueue(sse('done', { text: full, source: 'stub' }));
          controller.close();
          return;
        }

        const client = new GoogleGenerativeAI(apiKey);
        const model = client.getGenerativeModel({
          model: 'gemini-2.0-flash-exp',
          systemInstruction: systemPrompt || undefined,
          generationConfig: {
            temperature: temperature ?? 0.7,
            maxOutputTokens: 1024,
          },
        });

        const result = await model.generateContentStream(userPrompt || ' ');
        let full = '';
        for await (const chunk of result.stream) {
          const delta = chunk.text();
          if (!delta) continue;
          full += delta;
          controller.enqueue(sse('chunk', { delta }));
        }
        controller.enqueue(sse('done', { text: full, source: 'gemini' }));
        controller.close();
      } catch (err) {
        console.error('[api/llm-complete stream] error:', err);
        controller.enqueue(sse('error', { error: 'LLM call failed', details: String(err) }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disable proxy buffering on platforms that honour it (e.g. nginx).
      'X-Accel-Buffering': 'no',
    },
  });
}

function chunkStub(text: string): string[] {
  // Word-ish chunks so the stub feels like a real stream rather than per-char.
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
    `${sys}This is a stub response — set GEMINI_API_KEY to enable real Gemini ` +
    `completions. You asked: "${userPrompt.slice(0, 200)}"`
  );
}
