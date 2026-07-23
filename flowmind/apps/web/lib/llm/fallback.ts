import 'server-only';

import { GeminiError, mapUpstreamError } from '@/lib/gemini/errors';
import { LIMITS } from '@/lib/gemini/limits';

/**
 * Fallback LLM provider (OpenAI-compatible chat completions) used when no
 * Gemini credential is present — so real AI works without a paid Gemini key.
 *
 * Configured entirely by server env, in priority order:
 *   1. Custom  — LLM_FALLBACK_BASE_URL + LLM_FALLBACK_API_KEY (+ _MODEL)
 *   2. Grok    — XAI_API_KEY   (https://api.x.ai/v1)
 *   3. Llama   — GROQ_API_KEY  (https://api.groq.com/openai/v1)
 *
 * All three speak the OpenAI /chat/completions API, so one client covers them.
 */

export interface FallbackProvider {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function getFallbackProvider(): FallbackProvider | null {
  const modelOverride = process.env.LLM_FALLBACK_MODEL?.trim();

  const customKey = process.env.LLM_FALLBACK_API_KEY?.trim();
  const customBase = process.env.LLM_FALLBACK_BASE_URL?.trim();
  if (customKey && customBase) {
    return {
      name: 'custom',
      baseUrl: customBase.replace(/\/$/, ''),
      apiKey: customKey,
      model: modelOverride || 'gpt-4o-mini',
    };
  }

  const xai = process.env.XAI_API_KEY?.trim();
  if (xai) {
    return { name: 'grok', baseUrl: 'https://api.x.ai/v1', apiKey: xai, model: modelOverride || 'grok-2-latest' };
  }

  const groq = process.env.GROQ_API_KEY?.trim();
  if (groq) {
    return {
      name: 'llama',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: groq,
      model: modelOverride || 'llama-3.3-70b-versatile',
    };
  }

  return null;
}

interface ChatArgs {
  provider: FallbackProvider;
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  json?: boolean;
  signal?: AbortSignal;
}

function buildBody(a: ChatArgs, stream: boolean) {
  const messages: { role: string; content: string }[] = [];
  if (a.systemPrompt) messages.push({ role: 'system', content: a.systemPrompt });
  messages.push({ role: 'user', content: a.userPrompt || ' ' });
  return {
    model: a.provider.model,
    messages,
    temperature: a.temperature ?? 0.7,
    max_tokens: a.json ? LIMITS.maxGraphOutputTokens : LIMITS.maxOutputTokens,
    stream,
    ...(a.json ? { response_format: { type: 'json_object' } } : {}),
  };
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
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

export interface FallbackTextResult {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

/** Non-streaming completion. */
export async function fallbackGenerateText(
  args: Omit<ChatArgs, 'signal'>,
): Promise<FallbackTextResult> {
  return withTimeout(LIMITS.geminiRequestTimeoutMs, async (signal) => {
    let res: Response;
    try {
      res = await fetch(`${args.provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${args.provider.apiKey}`,
        },
        body: JSON.stringify(buildBody(args, false)),
        signal,
      });
    } catch (err) {
      throw mapUpstreamError(err);
    }
    if (!res.ok) throw mapUpstreamError({ status: res.status, message: await safeText(res) });
    const json = await res.json();
    return {
      text: json?.choices?.[0]?.message?.content ?? '',
      model: args.provider.model,
      inputTokens: json?.usage?.prompt_tokens,
      outputTokens: json?.usage?.completion_tokens,
    };
  });
}

export interface FallbackStream {
  model: string;
  deltas: AsyncGenerator<string, void, void>;
}

/** Streaming completion — yields text deltas. */
export async function fallbackStreamText(args: Omit<ChatArgs, 'signal' | 'json'>): Promise<FallbackStream> {
  let res: Response;
  try {
    res = await fetch(`${args.provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.provider.apiKey}`,
      },
      body: JSON.stringify(buildBody(args, true)),
    });
  } catch (err) {
    throw mapUpstreamError(err);
  }
  if (!res.ok || !res.body) {
    throw mapUpstreamError({ status: res.status, message: await safeText(res) });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  async function* gen(): AsyncGenerator<string, void, void> {
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (delta) yield delta as string;
          } catch {
            /* skip keep-alive / partial frames */
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  return { model: args.provider.model, deltas: gen() };
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return '';
  }
}
