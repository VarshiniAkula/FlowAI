import 'server-only';

import { requireUser } from '@/lib/auth/guards';
import { getGroqDemoConfig } from '@/lib/llm/config';
import { getGroqDemoUsage } from '@/lib/groq/usage';
import { resolveLlmProvider } from '@/lib/llm/resolver';
import type { LlmStatus } from '@/lib/llm/types';

/**
 * Resolve the sanitized LLM status for the current request. Mirrors the LLM
 * Response node's provider precedence but performs NO reservation — it only
 * reports which provider would be selected and, for Groq demo, how many demo
 * requests remain today. Never returns key material or key prefixes/suffixes.
 */
export async function getLlmStatus(): Promise<LlmStatus> {
  const provider = await resolveLlmProvider();

  if (provider.mode === 'gemini-byok') {
    return {
      mode: 'gemini-byok',
      provider: 'gemini',
      realAiAvailable: true,
      keyLastFour: provider.keyLastFour,
    };
  }

  if (provider.mode === 'gemini-platform') {
    return { mode: 'gemini-platform', provider: 'gemini', realAiAvailable: true };
  }

  if (provider.mode === 'groq-demo') {
    const cfg = getGroqDemoConfig();
    let userId: string | null = null;
    try {
      userId = (await requireUser()).id;
    } catch {
      userId = null;
    }
    // Groq demo is only usable by authenticated users.
    if (!userId) {
      return {
        mode: 'simulation',
        provider: 'deterministic',
        realAiAvailable: false,
        fallbackReason: 'GROQ_NOT_AUTHENTICATED',
      };
    }
    const usage = await getGroqDemoUsage(userId);
    const remaining = Math.max(cfg.userDailyLimit - usage.requestCount, 0);
    return {
      mode: 'groq-demo',
      provider: 'groq',
      realAiAvailable: true,
      demoRequestsRemaining: remaining,
      demoDailyLimit: cfg.userDailyLimit,
      demoResetAt: usage.resetAt,
    };
  }

  return {
    mode: 'simulation',
    provider: 'deterministic',
    realAiAvailable: false,
    fallbackReason: provider.fallbackReason,
  };
}
