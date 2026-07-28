import 'server-only';

import { generateText, streamText } from '@/lib/gemini/client';
import type { LlmProviderMode, LlmUsage, StreamingCompletion } from '@/lib/llm/types';

/**
 * Thin adapter over the existing Gemini client so the LLM Response node can
 * treat Gemini as one provider among several. Reuses lib/gemini/client (the SDK,
 * model resolution, timeouts, and error sanitization all live there) rather than
 * duplicating any of it. Errors propagate as the existing GeminiError.
 */

interface GeminiArgs {
  apiKey: string;
  mode: Extract<LlmProviderMode, 'gemini-byok' | 'gemini-platform'>;
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
}

export async function geminiGenerate(
  args: GeminiArgs,
): Promise<{ text: string; model: string; usage?: LlmUsage }> {
  const res = await generateText({
    apiKey: args.apiKey,
    systemPrompt: args.systemPrompt || undefined,
    userPrompt: args.userPrompt,
    temperature: args.temperature,
  });
  return {
    text: res.text,
    model: res.model,
    usage: { inputTokens: res.inputTokens, outputTokens: res.outputTokens },
  };
}

export async function geminiStreamAdapter(args: GeminiArgs): Promise<StreamingCompletion> {
  const { model, deltas } = await streamText({
    apiKey: args.apiKey,
    systemPrompt: args.systemPrompt || undefined,
    userPrompt: args.userPrompt,
    temperature: args.temperature,
  });

  async function* gen(): AsyncGenerator<string, LlmUsage | undefined> {
    while (true) {
      const next = await deltas.next();
      if (next.done) {
        const usage = next.value;
        return usage
          ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
          : undefined;
      }
      yield next.value;
    }
  }

  return { model, provider: 'gemini', providerMode: args.mode, deltas: gen() };
}
