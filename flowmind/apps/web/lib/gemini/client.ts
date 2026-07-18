import 'server-only';

import { GoogleGenAI } from '@google/genai';

import { GeminiError, mapUpstreamError } from './errors';
import { LIMITS, getGenerationModel, getGraphModel } from './limits';

/**
 * Centralized Gemini client construction and calls. Every route talks to
 * Gemini through this module so the SDK, model resolution, timeouts, and error
 * sanitization live in exactly one place.
 *
 * Server-only: it receives raw API keys (BYOK or platform) and must never be
 * importable from client code.
 */

function getClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

/** Run a promise with an AbortController-backed timeout. */
async function withTimeout<T>(
  ms: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } catch (err) {
    if (controller.signal.aborted) throw new GeminiError('UPSTREAM_TIMEOUT');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

interface ModelListItem {
  name?: string;
  supportedActions?: string[];
  supportedGenerationMethods?: string[];
}

/**
 * Validate a credential with a low-cost models-metadata request (no content
 * generation). Confirms auth works AND at least one text-generation model is
 * available. Returns the last four characters for display.
 */
export async function validateCredential(apiKey: string): Promise<{ keyLastFour: string }> {
  const ai = getClient(apiKey);
  await withTimeout(LIMITS.connectionValidationTimeoutMs, async (signal) => {
    let pager: AsyncIterable<ModelListItem>;
    try {
      // `list` returns a lazily-paginated iterable; we break after the first
      // usable generation model so we don't page through the whole catalog.
      pager = (await ai.models.list()) as unknown as AsyncIterable<ModelListItem>;
    } catch (err) {
      throw mapUpstreamError(err);
    }

    let usable = false;
    try {
      for await (const m of pager) {
        if (signal.aborted) throw new GeminiError('UPSTREAM_TIMEOUT');
        if (isTextGenerationModel(m)) {
          usable = true;
          break;
        }
      }
    } catch (err) {
      throw mapUpstreamError(err);
    }

    if (!usable) throw new GeminiError('NO_SUPPORTED_MODEL');
  });

  return { keyLastFour: lastFour(apiKey) };
}

function isTextGenerationModel(m: ModelListItem): boolean {
  const name = (m.name ?? '').toLowerCase();
  const actions = m.supportedActions ?? m.supportedGenerationMethods ?? [];
  if (actions.length > 0) {
    if (!actions.includes('generateContent')) return false;
  } else if (!/gemini/.test(name)) {
    return false;
  }
  // Exclude embedding / non-text models.
  return !/embed|aqa|imagen|veo/.test(name);
}

export interface GenerateTextResult {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

/** Non-streaming text completion. */
export async function generateText(opts: {
  apiKey: string;
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
}): Promise<GenerateTextResult> {
  const model = getGenerationModel();
  const ai = getClient(opts.apiKey);
  return withTimeout(LIMITS.geminiRequestTimeoutMs, async (signal) => {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: opts.userPrompt || ' ',
        config: {
          ...(opts.systemPrompt ? { systemInstruction: opts.systemPrompt } : {}),
          temperature: opts.temperature ?? 0.7,
          maxOutputTokens: LIMITS.maxOutputTokens,
          abortSignal: signal,
        },
      });
      return {
        text: res.text ?? '',
        model,
        inputTokens: res.usageMetadata?.promptTokenCount,
        outputTokens: res.usageMetadata?.candidatesTokenCount,
      };
    } catch (err) {
      throw mapUpstreamError(err);
    }
  });
}

export interface TextStream {
  model: string;
  /** Yields text deltas as they arrive. */
  deltas: AsyncGenerator<string, { inputTokens?: number; outputTokens?: number }, void>;
}

/**
 * Streaming text completion. Returns the resolved model plus an async
 * generator of deltas; the generator's return value carries token usage when
 * the SDK provides it.
 */
export async function streamText(opts: {
  apiKey: string;
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
}): Promise<TextStream> {
  const model = getGenerationModel();
  const ai = getClient(opts.apiKey);

  let sdkStream: AsyncIterable<{ text?: string; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }>;
  try {
    sdkStream = (await ai.models.generateContentStream({
      model,
      contents: opts.userPrompt || ' ',
      config: {
        ...(opts.systemPrompt ? { systemInstruction: opts.systemPrompt } : {}),
        temperature: opts.temperature ?? 0.7,
        maxOutputTokens: LIMITS.maxOutputTokens,
      },
    })) as typeof sdkStream;
  } catch (err) {
    throw mapUpstreamError(err);
  }

  async function* gen(): AsyncGenerator<string, { inputTokens?: number; outputTokens?: number }, void> {
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    try {
      for await (const chunk of sdkStream) {
        if (chunk.usageMetadata) {
          inputTokens = chunk.usageMetadata.promptTokenCount ?? inputTokens;
          outputTokens = chunk.usageMetadata.candidatesTokenCount ?? outputTokens;
        }
        const delta = chunk.text ?? '';
        if (delta) yield delta;
      }
    } catch (err) {
      throw mapUpstreamError(err);
    }
    return { inputTokens, outputTokens };
  }

  return { model, deltas: gen() };
}

/** Story-to-graph generation with JSON output. Returns raw JSON text. */
export async function generateGraphJson(opts: {
  apiKey: string;
  prompt: string;
}): Promise<{ text: string; model: string }> {
  const model = getGraphModel();
  const ai = getClient(opts.apiKey);
  return withTimeout(LIMITS.geminiRequestTimeoutMs, async (signal) => {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: opts.prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.7,
          maxOutputTokens: LIMITS.maxGraphOutputTokens,
          abortSignal: signal,
        },
      });
      return { text: res.text ?? '', model };
    } catch (err) {
      throw mapUpstreamError(err);
    }
  });
}

/** Last four characters of a key, for display. Never the whole key. */
export function lastFour(apiKey: string): string {
  const trimmed = apiKey.trim();
  return trimmed.slice(-4);
}
