/**
 * Sanitized error taxonomy for the Gemini integration.
 *
 * Client-safe: contains no secrets and no Node-only APIs, so the UI can import
 * the codes/messages. Upstream provider errors are mapped into these codes so
 * raw SDK error objects, headers, and stack traces never reach the browser.
 */

export type GeminiErrorCode =
  | 'INVALID_API_KEY'
  | 'API_NOT_ENABLED'
  | 'QUOTA_EXCEEDED'
  | 'NO_SUPPORTED_MODEL'
  | 'UPSTREAM_TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'NOT_CONNECTED'
  | 'SESSION_EXPIRED'
  | 'CONFIG_ERROR';

export interface GeminiErrorShape {
  code: GeminiErrorCode;
  message: string;
  status: number;
}

/** User-facing (safe) messages keyed by code. */
export const GEMINI_ERROR_MESSAGES: Record<GeminiErrorCode, string> = {
  INVALID_API_KEY:
    'Gemini rejected this key. Check that it is active and has access to the Gemini API.',
  API_NOT_ENABLED:
    'The Gemini API is not enabled for this key. Enable it in Google AI Studio and try again.',
  QUOTA_EXCEEDED:
    'This Gemini key has reached its current quota. Check its usage limits or connect another key.',
  NO_SUPPORTED_MODEL:
    'No usable Gemini text-generation model is available for this key.',
  UPSTREAM_TIMEOUT: 'Gemini took too long to respond. Retry the request or continue in demo mode.',
  PROVIDER_UNAVAILABLE:
    'Gemini is temporarily unavailable. Retry the request or continue in demo mode.',
  INVALID_REQUEST: 'The request was invalid. Please adjust your input and try again.',
  NOT_CONNECTED: 'No Gemini credential is connected.',
  SESSION_EXPIRED:
    'Your Gemini connection expired. Reconnect the key to continue using real AI responses.',
  CONFIG_ERROR: 'The Gemini integration is not configured correctly on the server.',
};

const STATUS_BY_CODE: Record<GeminiErrorCode, number> = {
  INVALID_API_KEY: 401,
  API_NOT_ENABLED: 403,
  QUOTA_EXCEEDED: 429,
  NO_SUPPORTED_MODEL: 422,
  UPSTREAM_TIMEOUT: 504,
  PROVIDER_UNAVAILABLE: 503,
  INVALID_REQUEST: 400,
  NOT_CONNECTED: 401,
  SESSION_EXPIRED: 401,
  CONFIG_ERROR: 500,
};

/** A sanitized, throwable error carrying a stable code + HTTP status. */
export class GeminiError extends Error {
  readonly code: GeminiErrorCode;
  readonly status: number;
  /** True when the caller may reasonably retry (transient upstream issues). */
  readonly retryable: boolean;

  constructor(code: GeminiErrorCode, message?: string) {
    super(message ?? GEMINI_ERROR_MESSAGES[code]);
    this.name = 'GeminiError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.retryable = code === 'UPSTREAM_TIMEOUT' || code === 'PROVIDER_UNAVAILABLE';
  }

  toResponseBody(): { error: GeminiErrorShape } {
    return { error: { code: this.code, message: this.message, status: this.status } };
  }
}

/**
 * Map an arbitrary upstream/SDK error into a sanitized GeminiError. Never
 * surfaces the raw object, headers, or key material. We inspect only the HTTP
 * status and a lowercased message string.
 */
export function mapUpstreamError(err: unknown): GeminiError {
  if (err instanceof GeminiError) return err;

  // AbortController-driven timeouts.
  const name = (err as { name?: string })?.name;
  if (name === 'AbortError' || name === 'TimeoutError') {
    return new GeminiError('UPSTREAM_TIMEOUT');
  }

  const status = extractStatus(err);
  const msg = extractMessage(err).toLowerCase();

  if (status === 429 || msg.includes('quota') || msg.includes('rate limit') || msg.includes('resource_exhausted')) {
    return new GeminiError('QUOTA_EXCEEDED');
  }
  if (
    status === 400 &&
    (msg.includes('api key not valid') || msg.includes('api_key_invalid') || msg.includes('invalid api key'))
  ) {
    return new GeminiError('INVALID_API_KEY');
  }
  if (status === 401 || status === 403) {
    if (msg.includes('not enabled') || msg.includes('has not been used') || msg.includes('permission')) {
      return new GeminiError('API_NOT_ENABLED');
    }
    return new GeminiError('INVALID_API_KEY');
  }
  if (status === 404 && msg.includes('model')) {
    return new GeminiError('NO_SUPPORTED_MODEL');
  }
  if (status === 408 || status === 504 || msg.includes('timeout') || msg.includes('timed out')) {
    return new GeminiError('UPSTREAM_TIMEOUT');
  }
  if (status === 500 || status === 502 || status === 503 || msg.includes('unavailable')) {
    return new GeminiError('PROVIDER_UNAVAILABLE');
  }
  if (status === 400) {
    return new GeminiError('INVALID_REQUEST');
  }
  // Default: treat as a transient provider issue rather than leaking details.
  return new GeminiError('PROVIDER_UNAVAILABLE');
}

function extractStatus(err: unknown): number | undefined {
  const e = err as { status?: unknown; code?: unknown; response?: { status?: unknown } };
  for (const v of [e?.status, e?.code, e?.response?.status]) {
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
