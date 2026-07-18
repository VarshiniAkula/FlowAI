import { describe, expect, it } from 'vitest';

import { GeminiError, mapUpstreamError } from '@/lib/gemini/errors';

describe('mapUpstreamError', () => {
  it('passes through an existing GeminiError', () => {
    const g = new GeminiError('QUOTA_EXCEEDED');
    expect(mapUpstreamError(g)).toBe(g);
  });

  it('maps 429 / quota to QUOTA_EXCEEDED', () => {
    expect(mapUpstreamError({ status: 429 }).code).toBe('QUOTA_EXCEEDED');
    expect(mapUpstreamError({ message: 'RESOURCE_EXHAUSTED: quota' }).code).toBe('QUOTA_EXCEEDED');
  });

  it('maps invalid-key messages to INVALID_API_KEY', () => {
    expect(mapUpstreamError({ status: 400, message: 'API key not valid' }).code).toBe('INVALID_API_KEY');
    expect(mapUpstreamError({ status: 403, message: 'permission denied' }).code).toBe('API_NOT_ENABLED');
  });

  it('maps aborts/timeouts to UPSTREAM_TIMEOUT', () => {
    expect(mapUpstreamError({ name: 'AbortError' }).code).toBe('UPSTREAM_TIMEOUT');
    expect(mapUpstreamError({ status: 504 }).code).toBe('UPSTREAM_TIMEOUT');
  });

  it('maps 5xx / unavailable to PROVIDER_UNAVAILABLE (retryable)', () => {
    const g = mapUpstreamError({ status: 503 });
    expect(g.code).toBe('PROVIDER_UNAVAILABLE');
    expect(g.retryable).toBe(true);
  });

  it('never surfaces the raw error object', () => {
    const g = mapUpstreamError({ status: 400, message: 'x-goog-api-key: SECRET' });
    expect(g.message).not.toContain('SECRET');
  });
});
