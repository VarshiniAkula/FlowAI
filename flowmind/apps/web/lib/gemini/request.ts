import 'server-only';

import { NextResponse } from 'next/server';

import { GeminiError } from './errors';

/**
 * Shared request helpers for the Gemini routes: same-origin enforcement and a
 * no-store JSON responder. Kept tiny and dependency-free.
 */

/** JSON response with caching disabled (credential-sensitive endpoints). */
export function jsonNoStore(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/** Turn any thrown error into a sanitized JSON response. */
export function errorResponse(err: unknown): NextResponse {
  const g = err instanceof GeminiError ? err : new GeminiError('PROVIDER_UNAVAILABLE');
  return jsonNoStore(g.toResponseBody(), g.status);
}

/**
 * Reject cross-origin state-changing requests. Compares the Origin host (or
 * Referer host when Origin is absent) to the request Host. Same-origin
 * requests without either header are allowed (some browsers omit Origin on
 * same-origin same-site requests).
 */
export function assertSameOrigin(req: Request): void {
  const host = req.headers.get('host');
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');

  const candidate = origin ?? referer;
  if (!candidate) return; // no cross-origin signal to reject

  let candidateHost: string;
  try {
    candidateHost = new URL(candidate).host;
  } catch {
    throw new GeminiError('INVALID_REQUEST', 'Invalid request origin.');
  }

  if (host && candidateHost !== host) {
    throw new GeminiError('INVALID_REQUEST', 'Cross-origin request rejected.');
  }
}
