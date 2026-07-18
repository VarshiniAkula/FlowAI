/**
 * Client-safe types shared between the Gemini integration routes and the UI.
 * Contains no secrets and no server-only imports.
 */

export type GeminiMode = 'byok' | 'platform' | 'fallback';

/** Sanitized connection status returned by the status/connect/disconnect routes. */
export type GeminiStatus =
  | { connected: true; mode: 'byok'; keyLastFour: string; expiresAt: string }
  | { connected: true; mode: 'platform' }
  | { connected: false; mode: 'fallback' };

/** Safe provider metadata that AI routes may echo back (never key material). */
export interface GeminiProviderMeta {
  providerMode: GeminiMode;
  model?: string;
}
