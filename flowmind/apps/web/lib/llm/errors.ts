/**
 * Provider-neutral Groq error taxonomy.
 *
 * Client-safe: no secrets, no Node-only APIs. Raw Groq/SDK error objects,
 * headers, and bodies are mapped into these stable codes so nothing sensitive
 * (API key, authorization header, upstream request/response) ever leaks into an
 * HTTP response, SSE frame, trace, or log.
 */

import type { LlmFallbackReason } from './types';

export type GroqErrorCode =
  | 'GROQ_INVALID_KEY'
  | 'GROQ_MODEL_UNAVAILABLE'
  | 'GROQ_RATE_LIMITED'
  | 'GROQ_QUOTA_EXCEEDED'
  | 'GROQ_TIMEOUT'
  | 'GROQ_PROVIDER_UNAVAILABLE'
  | 'GROQ_INVALID_REQUEST'
  | 'GROQ_UNKNOWN_ERROR';

/** A sanitized Groq error. Carries a stable code + an optional retry hint. */
export class GroqError extends Error {
  readonly code: GroqErrorCode;
  /** Sanitized retry hint in seconds (from a parsed Retry-After), if any. */
  readonly retryAfterSeconds?: number;

  constructor(code: GroqErrorCode, retryAfterSeconds?: number) {
    super(code);
    this.name = 'GroqError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Map an arbitrary Groq SDK error into a sanitized GroqError. Inspects only the
 * numeric HTTP status, a lowercased message, and a Retry-After header — never
 * echoes the raw object, headers, or key material.
 *
 * HTTP mapping:
 *   400 → invalid request
 *   401/403 → invalid/misconfigured platform key
 *   404 → model unavailable
 *   429 → rate limited or quota exceeded
 *   5xx → provider unavailable
 *   timeout/abort → timeout
 */
export function mapGroqError(err: unknown): GroqError {
  const name = (err as { name?: string })?.name;
  if (name === 'AbortError' || name === 'TimeoutError') {
    return new GroqError('GROQ_TIMEOUT');
  }

  const status = extractStatus(err);
  const msg = extractMessage(err).toLowerCase();

  if (status === 400) return new GroqError('GROQ_INVALID_REQUEST');
  if (status === 401 || status === 403) return new GroqError('GROQ_INVALID_KEY');
  if (status === 404) return new GroqError('GROQ_MODEL_UNAVAILABLE');
  if (status === 429) {
    const retryAfter = extractRetryAfterSeconds(err);
    if (msg.includes('quota') || msg.includes('insufficient') || msg.includes('billing')) {
      return new GroqError('GROQ_QUOTA_EXCEEDED', retryAfter);
    }
    return new GroqError('GROQ_RATE_LIMITED', retryAfter);
  }
  if (status === 408 || status === 504 || msg.includes('timeout') || msg.includes('timed out')) {
    return new GroqError('GROQ_TIMEOUT');
  }
  if (
    (typeof status === 'number' && status >= 500) ||
    msg.includes('unavailable') ||
    msg.includes('overloaded')
  ) {
    return new GroqError('GROQ_PROVIDER_UNAVAILABLE');
  }
  return new GroqError('GROQ_UNKNOWN_ERROR');
}

/** Translate a Groq error code into the fallback reason surfaced to the UI. */
export function groqErrorToFallbackReason(code: GroqErrorCode): LlmFallbackReason {
  switch (code) {
    case 'GROQ_RATE_LIMITED':
      return 'GROQ_RATE_LIMITED';
    case 'GROQ_QUOTA_EXCEEDED':
      return 'GROQ_QUOTA_EXCEEDED';
    case 'GROQ_TIMEOUT':
      return 'GROQ_TIMEOUT';
    case 'GROQ_INVALID_REQUEST':
      return 'GROQ_INVALID_REQUEST';
    case 'GROQ_INVALID_KEY':
    case 'GROQ_MODEL_UNAVAILABLE':
    case 'GROQ_PROVIDER_UNAVAILABLE':
      return 'GROQ_PROVIDER_UNAVAILABLE';
    default:
      return 'GROQ_UNKNOWN_ERROR';
  }
}

function extractStatus(err: unknown): number | undefined {
  const e = err as { status?: unknown; code?: unknown; response?: { status?: unknown } };
  for (const v of [e?.status, e?.response?.status, e?.code]) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && /^\d{3}$/.test(v)) return Number.parseInt(v, 10);
  }
  return undefined;
}

function extractMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  const m = (err as { message?: unknown })?.message;
  return typeof m === 'string' ? m : '';
}

/** Parse a numeric Retry-After (seconds) from common SDK error shapes. */
function extractRetryAfterSeconds(err: unknown): number | undefined {
  const headers = (err as { headers?: unknown })?.headers;
  let raw: unknown;
  if (headers && typeof (headers as { get?: unknown }).get === 'function') {
    raw = (headers as { get: (k: string) => unknown }).get('retry-after');
  } else if (headers && typeof headers === 'object') {
    raw = (headers as Record<string, unknown>)['retry-after'];
  }
  if (typeof raw === 'string' || typeof raw === 'number') {
    const n = Number.parseInt(String(raw), 10);
    if (Number.isFinite(n) && n >= 0 && n <= 3600) return n;
  }
  return undefined;
}
