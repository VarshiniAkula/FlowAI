/**
 * Provider-neutral LLM types shared across the server providers, the resolver,
 * and the /api/llm-complete + /api/llm-status routes.
 *
 * Client-safe: no secrets, no server-only imports, so the UI can import the
 * union types below to render provider status and trace metadata.
 */

export type LlmProviderName = 'gemini' | 'groq' | 'deterministic';

export type LlmProviderMode =
  | 'gemini-byok'
  | 'groq-demo'
  | 'gemini-platform'
  | 'simulation';

/** Sanitized fallback reasons surfaced to the UI when a real provider is skipped. */
export type LlmFallbackReason =
  | 'GROQ_NOT_CONFIGURED'
  | 'GROQ_NOT_AUTHENTICATED'
  | 'GROQ_USER_LIMIT_REACHED'
  | 'GROQ_GLOBAL_LIMIT_REACHED'
  | 'GROQ_RATE_LIMITED'
  | 'GROQ_QUOTA_EXCEEDED'
  | 'GROQ_TIMEOUT'
  | 'GROQ_PROVIDER_UNAVAILABLE'
  | 'GROQ_INVALID_REQUEST'
  | 'GROQ_PROMPT_TOO_LARGE'
  | 'GROQ_UNKNOWN_ERROR';

export interface LlmCompletionRequest {
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  stream: boolean;
  signal?: AbortSignal;
}

export interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface LlmCompletionMetadata {
  provider: LlmProviderName;
  providerMode: LlmProviderMode;
  model: string;
  durationMs: number;
  usage?: LlmUsage;
  fallbackReason?: LlmFallbackReason;
  /** Remaining Groq demo requests for this user today (Groq demo only). */
  demoRequestsRemaining?: number;
  /** UTC ISO timestamp when the Groq demo allowance resets (Groq demo only). */
  demoResetAt?: string;
}

export interface NonStreamingCompletion {
  text: string;
  metadata: LlmCompletionMetadata;
}

export interface StreamingCompletion {
  model: string;
  provider: LlmProviderName;
  providerMode: LlmProviderMode;
  /** Yields answer-text deltas; returns final usage (never reasoning content). */
  deltas: AsyncGenerator<string, LlmUsage | undefined>;
}

/**
 * Sanitized status returned by GET /api/llm-status for the simulator/editor UI.
 * Never exposes key material, key prefixes/suffixes, org info, or raw env.
 */
export type LlmStatus =
  | { mode: 'gemini-byok'; provider: 'gemini'; realAiAvailable: true; keyLastFour?: string }
  | { mode: 'gemini-platform'; provider: 'gemini'; realAiAvailable: true }
  | {
      mode: 'groq-demo';
      provider: 'groq';
      realAiAvailable: true;
      demoRequestsRemaining: number;
      demoDailyLimit: number;
      demoResetAt: string;
    }
  | {
      mode: 'simulation';
      provider: 'deterministic';
      realAiAvailable: false;
      fallbackReason: LlmFallbackReason;
    };
