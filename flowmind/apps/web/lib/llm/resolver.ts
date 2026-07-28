import 'server-only';

import { resolveGeminiCredential } from '@/lib/gemini/credentials';
import { getGroqDemoConfig, isPlatformGeminiLlmFallbackAllowed } from '@/lib/llm/config';
import type { LlmFallbackReason } from '@/lib/llm/types';

/**
 * LLM Response node provider precedence (this route only — it does NOT change
 * the global Gemini credential resolver used by graph generation):
 *
 *   1. User Gemini BYOK
 *   2. FlowMind Groq demo provider (enabled + configured)
 *   3. Platform Gemini — ONLY when ALLOW_PLATFORM_GEMINI_LLM_FALLBACK === 'true'
 *   4. Deterministic simulation
 *
 * The resolver only decides WHICH provider applies. It does not authenticate the
 * user or reserve quota — the route does that for Groq (auth + atomic
 * reservation) before actually calling the provider, and falls through to
 * simulation transparently when reservation is denied.
 */

export type ResolvedLlmProvider =
  | { mode: 'gemini-byok'; apiKey: string; keyLastFour: string; expiresAt: number }
  | { mode: 'groq-demo' }
  | { mode: 'gemini-platform'; apiKey: string }
  | { mode: 'simulation'; fallbackReason: LlmFallbackReason };

export async function resolveLlmProvider(): Promise<ResolvedLlmProvider> {
  const cred = await resolveGeminiCredential();

  // 1. A connected BYOK credential is an explicit user choice — always first.
  if (cred.mode === 'byok') {
    return {
      mode: 'gemini-byok',
      apiKey: cred.apiKey,
      keyLastFour: cred.keyLastFour,
      expiresAt: cred.expiresAt,
    };
  }

  // 2. FlowMind Groq demo, when enabled + a server key is configured.
  if (getGroqDemoConfig().enabled) {
    return { mode: 'groq-demo' };
  }

  // 3. Platform Gemini — only behind the explicit opt-in flag, so a
  //    graph-generation GEMINI_API_KEY never becomes an uncapped LLM fallback.
  if (cred.mode === 'platform' && isPlatformGeminiLlmFallbackAllowed()) {
    return { mode: 'gemini-platform', apiKey: cred.apiKey };
  }

  // 4. Deterministic simulation.
  return { mode: 'simulation', fallbackReason: 'GROQ_NOT_CONFIGURED' };
}
