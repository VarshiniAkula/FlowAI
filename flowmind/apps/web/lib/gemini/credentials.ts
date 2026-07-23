import 'server-only';

import { cookies } from 'next/headers';

import {
  decryptSession,
  encryptSession,
  type GeminiCredentialSession,
} from './encryption';
import { GeminiError } from './errors';
import {
  GEMINI_COOKIE_NAME,
  GEMINI_SESSION_VERSION,
  getByokTtlMinutes,
} from './limits';
import type { GeminiStatus } from './types';
import { getFallbackProvider } from '@/lib/llm/fallback';

/**
 * The single source of truth for Gemini credential precedence:
 *   1. a valid session BYOK credential (from the encrypted cookie)
 *   2. the server-side GEMINI_API_KEY (platform mode)
 *   3. deterministic fallback
 *
 * Both AI routes call resolveGeminiCredential() so cookie parsing and
 * precedence live in exactly one place.
 */
export type GeminiCredentialSource =
  | { mode: 'byok'; apiKey: string; keyLastFour: string; expiresAt: number }
  | { mode: 'platform'; apiKey: string }
  | { mode: 'fallback' };

/**
 * Read + decrypt the BYOK cookie. Returns the session on success. On any
 * failure (malformed / tampered / expired / wrong version) the cookie is
 * deleted and null is returned — a bad cookie never counts as connected.
 */
async function readByokSession(): Promise<GeminiCredentialSession | null> {
  const store = await cookies();
  const raw = store.get(GEMINI_COOKIE_NAME)?.value;
  if (!raw) return null;

  try {
    return decryptSession(raw);
  } catch {
    // Do not log the encrypted value. Just clear it and treat as disconnected.
    await clearByokCredential();
    return null;
  }
}

/** Resolve the effective credential for this request. */
export async function resolveGeminiCredential(): Promise<GeminiCredentialSource> {
  const session = await readByokSession();
  if (session) {
    return {
      mode: 'byok',
      apiKey: session.apiKey,
      keyLastFour: session.keyLastFour,
      expiresAt: session.expiresAt,
    };
  }

  const platform = process.env.GEMINI_API_KEY?.trim();
  if (platform) {
    return { mode: 'platform', apiKey: platform };
  }

  return { mode: 'fallback' };
}

/** Sanitized status for the UI. Never exposes key material. */
export async function getGeminiStatus(): Promise<GeminiStatus> {
  const source = await resolveGeminiCredential();
  if (source.mode === 'byok') {
    return {
      connected: true,
      mode: 'byok',
      keyLastFour: source.keyLastFour,
      expiresAt: new Date(source.expiresAt).toISOString(),
    };
  }
  if (source.mode === 'platform') {
    return { connected: true, mode: 'platform' };
  }
  // A configured fallback provider (Grok/Llama) still means real AI is
  // available — report platform mode so the UI doesn't show "demo mode".
  if (getFallbackProvider()) {
    return { connected: true, mode: 'platform' };
  }
  return { connected: false, mode: 'fallback' };
}

/** Encrypt + set the BYOK session cookie. Returns the sanitized status. */
export async function setByokCredential(
  apiKey: string,
  keyLastFour: string,
): Promise<Extract<GeminiStatus, { mode: 'byok' }>> {
  const now = Date.now();
  const ttlMs = getByokTtlMinutes() * 60_000;
  const expiresAt = now + ttlMs;

  const session: GeminiCredentialSession = {
    version: GEMINI_SESSION_VERSION,
    apiKey,
    keyLastFour,
    connectedAt: now,
    expiresAt,
  };

  const value = encryptSession(session);
  const store = await cookies();
  store.set(GEMINI_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: Math.floor(ttlMs / 1000),
  });

  return {
    connected: true,
    mode: 'byok',
    keyLastFour,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

/** Delete the BYOK session cookie. Idempotent. */
export async function clearByokCredential(): Promise<void> {
  try {
    const store = await cookies();
    store.delete(GEMINI_COOKIE_NAME);
  } catch {
    // cookies() is read-only in some contexts; ignore — nothing to clear.
  }
}

/** Assert a BYOK session is present + valid, or throw a sanitized error. */
export function assertByok(source: GeminiCredentialSource): asserts source is Extract<
  GeminiCredentialSource,
  { mode: 'byok' }
> {
  if (source.mode !== 'byok') {
    throw new GeminiError('NOT_CONNECTED');
  }
}
