import 'server-only';

/**
 * Server-only configuration for the FlowMind Groq demo provider and the
 * platform-Gemini LLM fallback flag. Every value is read from the environment
 * with safe parsing + documented defaults. Nothing here is ever returned to a
 * client — callers derive sanitized status from it, never the raw values.
 *
 * FlowMind's demo limits are intentionally configurable (Groq's own free-plan
 * limits change over time); we never hardcode Groq's external plan numbers.
 */

const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b';

const DEFAULTS = {
  userDailyLimit: 5,
  globalDailyLimit: 100,
  maxPromptChars: 6_000,
  maxOutputTokens: 300,
  requestTimeoutMs: 30_000,
} as const;

/**
 * Parse a positive integer env var. Rejects non-finite, zero, negative, and
 * absurdly large values (guards against a fat-fingered env var uncapping the
 * platform bill), falling back to the documented default.
 */
function parsePositiveInt(raw: string | undefined, fallback: number, max: number): number {
  if (raw == null) return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n <= 0 || n > max) return fallback;
  return n;
}

export interface GroqDemoConfig {
  /** True only when GROQ_DEMO_ENABLED === 'true' AND a key is present. */
  enabled: boolean;
  /** Present only server-side; never expose. */
  apiKey: string | null;
  model: string;
  userDailyLimit: number;
  globalDailyLimit: number;
  maxPromptChars: number;
  maxOutputTokens: number;
  requestTimeoutMs: number;
}

/** Resolve the Groq demo configuration for this request. */
export function getGroqDemoConfig(): GroqDemoConfig {
  const apiKey = process.env.GROQ_API_KEY?.trim() || null;
  // Demo mode is unavailable unless BOTH the flag is exactly 'true' and a key
  // is configured. A missing key always means "not configured", never a crash.
  const flag = process.env.GROQ_DEMO_ENABLED?.trim() === 'true';

  return {
    enabled: flag && apiKey !== null,
    apiKey,
    model: process.env.GROQ_LLM_MODEL?.trim() || DEFAULT_GROQ_MODEL,
    userDailyLimit: parsePositiveInt(
      process.env.GROQ_DEMO_USER_DAILY_LIMIT,
      DEFAULTS.userDailyLimit,
      100_000,
    ),
    globalDailyLimit: parsePositiveInt(
      process.env.GROQ_DEMO_GLOBAL_DAILY_LIMIT,
      DEFAULTS.globalDailyLimit,
      10_000_000,
    ),
    maxPromptChars: parsePositiveInt(
      process.env.GROQ_DEMO_MAX_PROMPT_CHARS,
      DEFAULTS.maxPromptChars,
      200_000,
    ),
    maxOutputTokens: parsePositiveInt(
      process.env.GROQ_DEMO_MAX_OUTPUT_TOKENS,
      DEFAULTS.maxOutputTokens,
      8_192,
    ),
    requestTimeoutMs: parsePositiveInt(
      process.env.GROQ_REQUEST_TIMEOUT_MS,
      DEFAULTS.requestTimeoutMs,
      120_000,
    ),
  };
}

/**
 * Whether the LLM Response node may use the platform GEMINI_API_KEY as a
 * fallback. Off by default so a `GEMINI_API_KEY` set for graph-generation does
 * NOT silently become an uncapped paid LLM-node fallback in production.
 */
export function isPlatformGeminiLlmFallbackAllowed(): boolean {
  return process.env.ALLOW_PLATFORM_GEMINI_LLM_FALLBACK?.trim() === 'true';
}

/** The provider key recorded in the usage table for Groq demo requests. */
export const GROQ_USAGE_PROVIDER = 'groq' as const;
