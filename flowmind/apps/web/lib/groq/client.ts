import 'server-only';

import Groq from 'groq-sdk';

import { getGroqDemoConfig } from '@/lib/llm/config';

/**
 * Centralized Groq client factory. The GROQ_API_KEY is read here only, on the
 * server, and is never logged, returned, or embedded in any error. Do not
 * construct `new Groq()` anywhere else.
 *
 * Timeout + cancellation are handled per-request by the provider (it passes a
 * `signal` and a `timeout` to the SDK call), so the shared client stays simple.
 */
export function createGroqClient(): Groq {
  const { apiKey } = getGroqDemoConfig();
  if (!apiKey) {
    // Callers must gate on getGroqDemoConfig().enabled first; this is a
    // defensive guard so a misconfiguration fails clearly, without a key.
    throw new Error('GROQ_NOT_CONFIGURED');
  }
  return new Groq({
    apiKey,
    // Never auto-retry: a recruiter-facing demo must fall back predictably
    // instead of silently burning the shared allowance on retries.
    maxRetries: 0,
  });
}
