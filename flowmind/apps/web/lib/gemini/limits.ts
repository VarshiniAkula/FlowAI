/**
 * Shared configuration for the Gemini integration: request limits, timeouts,
 * cookie identity, TTL, and model-name resolution.
 *
 * This module is safe to import from anywhere (no secrets, no Node-only APIs).
 * Values that come from the environment are read lazily so that missing config
 * fails at first use with a clear message rather than at module load.
 */

export const GEMINI_COOKIE_NAME = 'flowmind_gemini_session';

/** Encrypted-session payload version. Bump on incompatible shape changes. */
export const GEMINI_SESSION_VERSION = 1 as const;

/** Request limits (characters) and timeouts (ms). */
export const LIMITS = {
  maxGraphDescriptionChars: 10_000,
  maxLlmPromptChars: 20_000,
  maxApiKeyChars: 512,
  minApiKeyChars: 20,
  geminiRequestTimeoutMs: 45_000,
  connectionValidationTimeoutMs: 15_000,
  maxOutputTokens: 1024,
  maxGraphOutputTokens: 4096,
} as const;

/** Default model used when neither env override is set. */
const DEFAULT_MODEL = 'gemini-2.0-flash';

/**
 * Resolve the model for LLM-node completions. Falls back to the graph model,
 * then to the built-in default, so configuring one value configures both.
 */
export function getGenerationModel(): string {
  return (
    process.env.GEMINI_GENERATION_MODEL?.trim() ||
    process.env.GEMINI_GRAPH_MODEL?.trim() ||
    DEFAULT_MODEL
  );
}

/** Resolve the model for story-to-graph generation (JSON output). */
export function getGraphModel(): string {
  return (
    process.env.GEMINI_GRAPH_MODEL?.trim() ||
    process.env.GEMINI_GENERATION_MODEL?.trim() ||
    DEFAULT_MODEL
  );
}

/** Session TTL in minutes (default 4 hours). */
export function getByokTtlMinutes(): number {
  const raw = process.env.GEMINI_BYOK_TTL_MINUTES?.trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 240;
}
